import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../context/AuthContext";
import { requireClient } from "../lib/supabase";
import { addWorker, deleteAttendance, fetchDayAttendance, fetchPublicRoles, fetchPublicWorkers, fetchWorkerSupervisors, saveAttendance } from "../lib/db";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import type {
  AttendanceStatus,
  DayAttendanceRow,
  PublicRole,
  PublicWorker,
  WorkLocation,
} from "../lib/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Full",
  half_day: "Half",
  absent: "Absent",
};

const STATUS_PILL: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700",
  half_day: "bg-amber-50 text-amber-700",
  absent: "bg-red-50 text-red-600",
};

type Team = { id: string | null; name: string; isMe: boolean; workers: PublicWorker[] };

export function SupervisorAttendancePage() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [locationId, setLocationId] = useState<string>("");
  const [workers, setWorkers] = useState<PublicWorker[]>([]);
  const [roles, setRoles] = useState<PublicRole[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, DayAttendanceRow>>({});
  const [loading, setLoading] = useState(true);
  const [busyWorker, setBusyWorker] = useState<string | null>(null);
  const [bulkTeam, setBulkTeam] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });

  const load = useCallback(async () => {
    try {
      const [w, r, a] = await Promise.all([
        fetchPublicWorkers(),
        fetchPublicRoles(),
        fetchDayAttendance(date),
      ]);
      const supervisorIds = [
        ...new Set(w.map((x) => x.supervisor_profile_id).filter((x): x is string => !!x)),
      ];
      // Team inference is a convenience; never let it block attendance.
      const teams = await fetchWorkerSupervisors(supervisorIds).catch(() => ({}));
      setWorkers(w);
      setRoles(r);
      setAssignments(teams);
      const map: Record<string, DayAttendanceRow> = {};
      for (const row of a) map[row.worker_id] = row;
      setMarked(map);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const client = requireClient();
    const channel = client
      .channel(`sup-att-${date}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, load)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [date, load]);

  const activeLocations = useMemo(() => locations.filter((l) => l.active), [locations]);
  const currentLocationId = useMemo(() => {
    if (locationId && activeLocations.some((l) => l.id === locationId)) return locationId;
    return activeLocations[0]?.id ?? "";
  }, [locationId, activeLocations]);

  // A supervisor's display name comes from their own worker row.
  const supervisorNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workers) {
      if (w.supervisor_profile_id) m.set(w.supervisor_profile_id, w.name);
    }
    return m;
  }, [workers]);

  const supervisorSelfWorker = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workers) {
      if (w.supervisor_profile_id) m.set(w.supervisor_profile_id, w.id);
    }
    return m;
  }, [workers]);

  // Group workers under the supervisor who usually marks them: you first,
  // then the other supervisors, then anyone without a known team yet.
  const teams = useMemo<Team[]>(() => {
    const buckets = new Map<string, PublicWorker[]>();
    const unassigned: PublicWorker[] = [];
    for (const w of workers) {
      const teamId = w.supervisor_profile_id ?? assignments[w.id] ?? null;
      if (teamId && supervisorNames.has(teamId)) {
        const list = buckets.get(teamId) ?? [];
        list.push(w);
        buckets.set(teamId, list);
      } else {
        unassigned.push(w);
      }
    }

    const me = profile?.id;
    const list: Team[] = [];
    for (const [id, teamWorkers] of buckets) {
      const isMe = id === me;
      const selfId = supervisorSelfWorker.get(id);
      // A supervisor with no team of their own (e.g. a test login) adds noise.
      if (!isMe && teamWorkers.every((w) => w.id === selfId)) continue;
      list.push({
        id,
        name: (isMe ? profile?.display_name : null) || supervisorNames.get(id) || "Supervisor",
        isMe,
        workers: teamWorkers,
      });
    }
    list.sort((a, b) => (a.isMe !== b.isMe ? (a.isMe ? -1 : 1) : a.name.localeCompare(b.name)));
    if (unassigned.length > 0) {
      list.push({ id: null, name: "Unassigned", isMe: false, workers: unassigned });
    }
    return list;
  }, [workers, assignments, supervisorNames, supervisorSelfWorker, profile?.id, profile?.display_name]);

  const toMark = useMemo(() => workers.filter((w) => !marked[w.id]), [workers, marked]);
  const alreadyMarked = useMemo(
    () => workers.filter((w) => marked[w.id]).map((w) => marked[w.id]),
    [workers, marked],
  );

  const mark = async (worker: PublicWorker, status: AttendanceStatus) => {
    setError(null);
    setBusyWorker(worker.id);
    try {
      await saveAttendance({
        worker_id: worker.id,
        work_date: date,
        location_id: currentLocationId || null,
        role_id: worker.role_id,
        status,
        hours: null,
        note: null,
        marked_by: profile?.id ?? null,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusyWorker(null);
    }
  };

  const markTeamPresent = async (team: Team) => {
    const pending = team.workers.filter((w) => !marked[w.id]);
    setError(null);
    if (pending.length === 0) return;
    setBulkTeam(team.id ?? "unassigned");
    try {
      for (const w of pending) {
        await saveAttendance({
          worker_id: w.id,
          work_date: date,
          location_id: currentLocationId || null,
          role_id: w.role_id,
          status: "present",
          hours: null,
          note: null,
          marked_by: profile?.id ?? null,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBulkTeam(null);
    }
  };

  const undo = async (row: DayAttendanceRow) => {
    setError(null);
    setBusyWorker(row.worker_id);
    try {
      const client = requireClient();
      const { data } = await client
        .from("attendance")
        .select("id")
        .eq("worker_id", row.worker_id)
        .eq("work_date", date)
        .maybeSingle();
      if (data?.id) await deleteAttendance(data.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo");
    } finally {
      setBusyWorker(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="rounded-xl px-3 py-2 text-slate-500 active:bg-slate-100"
            aria-label="Previous day"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-semibold text-slate-900">{prettyDate(date)}</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="mt-0.5 bg-transparent text-center text-xs text-brand-700 underline"
            />
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            className="rounded-xl px-3 py-2 text-slate-500 active:bg-slate-100"
            aria-label="Next day"
          >
            ›
          </button>
        </div>

        {activeLocations.length > 0 ? (
          <div className="mt-3">
            <Field label="Working at">
              <select
                value={currentLocationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={inputClass}
              >
                {activeLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            No sites yet. Ask the owner to add one.
          </p>
        )}
      </Card>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setAddOpen(true)} className="flex-1 py-2 text-xs">
          + Add worker
        </Button>
        <Button variant="secondary" onClick={load} className="py-2 text-xs">
          Refresh
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-medium text-slate-500">
              {toMark.length} to mark · {alreadyMarked.length} done
            </p>
          </div>

          {toMark.length === 0 ? (
            <Empty title="Everyone is marked" hint="Any worker already logged today appears below." />
          ) : (
            <div className="space-y-5">
              {teams.map((team) => {
                const pending = team.workers.filter((w) => !marked[w.id]);
                if (pending.length === 0) return null;
                const key = team.id ?? "unassigned";
                return (
                  <section key={key} className="space-y-2">
                    <div className="flex items-end justify-between gap-2 px-1">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <span className="truncate">{team.name}</span>
                          {team.isMe ? (
                            <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                              you
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {pending.length} to mark · {team.workers.length} workers
                        </p>
                      </div>
                      {team.isMe ? (
                        <Button
                          variant="ghost"
                          onClick={() => markTeamPresent(team)}
                          disabled={bulkTeam !== null}
                          className="shrink-0 text-xs"
                        >
                          {bulkTeam === key ? "Marking…" : "Mark present"}
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {pending.map((w) => {
                        const isBusy = busyWorker === w.id;
                        return (
                          <Card key={w.id} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {w.name}
                                  {w.id === profile?.worker_id ? (
                                    <span className="ml-2 text-xs font-normal text-slate-400">you</span>
                                  ) : null}
                                </p>
                                <p className="truncate text-xs text-slate-500">{w.role_name ?? "No role"}</p>
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                              {(["present", "half_day", "absent"] as AttendanceStatus[]).map((s) => (
                                <button
                                  key={s}
                                  disabled={isBusy}
                                  onClick={() => mark(w, s)}
                                  className="rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-600 transition active:bg-slate-200 disabled:opacity-40"
                                >
                                  {STATUS_LABEL[s]}
                                </button>
                              ))}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {alreadyMarked.length > 0 ? (
            <div className="pt-2">
              <p className="mb-2 px-1 text-sm font-medium text-slate-500">Already marked today</p>
              <div className="space-y-2">
                {alreadyMarked.map((row) => {
                  const mine = row.marked_by_profile_id === profile?.id;
                  return (
                    <Card key={row.worker_id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{row.worker_name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {row.location_name ?? "No site"} · by{" "}
                            {mine ? "you" : row.marked_by_name ?? "unknown"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[row.status]}`}>
                            {STATUS_LABEL[row.status]}
                          </span>
                          {mine ? (
                            <button
                              onClick={() => undo(row)}
                              disabled={busyWorker === row.worker_id}
                              className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 active:bg-red-50 disabled:opacity-40"
                            >
                              Undo
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}

      {addOpen ? (
        <AddWorkerModal
          roles={roles}
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function AddWorkerModal({
  roles,
  onClose,
  onSaved,
}: {
  roles: PublicRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("Enter the worker's name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addWorker(name.trim(), roleId || null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add worker");
      setBusy(false);
    }
  };

  return (
    <Modal title="Add worker" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
          Add the name and role. The owner will set the pay rate.
        </p>
        <Field label="Name">
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Worker name"
          />
        </Field>
        <Field label="Role / work type">
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
            <option value="">— none —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Adding…" : "Add worker"}
        </Button>
      </div>
    </Modal>
  );
}
