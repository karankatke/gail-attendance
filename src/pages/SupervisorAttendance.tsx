import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Spinner } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { useAttendance } from "../hooks/useAttendance";
import { useAuth } from "../context/AuthContext";
import { fetchPublicWorkers, saveAttendance } from "../lib/db";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import type { AttendanceStatus, PublicWorker, WorkLocation } from "../lib/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Full",
  half_day: "Half",
  absent: "Absent",
};

export function SupervisorAttendancePage() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [locationId, setLocationId] = useState<string>("");
  const [workers, setWorkers] = useState<PublicWorker[]>([]);
  const [wLoading, setWLoading] = useState(true);
  const [busyWorker, setBusyWorker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const { byWorker, refetch } = useAttendance(date);

  const loadWorkers = useCallback(async () => {
    try {
      setWorkers(await fetchPublicWorkers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workers");
    } finally {
      setWLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const activeLocations = useMemo(() => locations.filter((l) => l.active), [locations]);
  const currentLocationId = locationId || activeLocations[0]?.id || "";

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
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusyWorker(null);
    }
  };

  const markAllPresent = async () => {
    setError(null);
    const pending = workers.filter((w) => !byWorker[w.id]);
    if (pending.length === 0) return;
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
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
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
            <p className="mb-1.5 text-xs font-medium text-slate-500">Working at</p>
            <div className="flex flex-wrap gap-2">
              {activeLocations.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLocationId(l.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    currentLocationId === l.id ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            No sites yet. Ask the owner to add one.
          </p>
        )}
      </Card>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {workers.length > 0 ? (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-medium text-slate-500">{workers.length} workers</p>
          <Button variant="ghost" onClick={markAllPresent}>
            Mark rest present
          </Button>
        </div>
      ) : null}

      {wLoading ? (
        <Spinner />
      ) : workers.length === 0 ? (
        <Empty title="No workers yet" hint="The owner adds workers." />
      ) : (
        <div className="space-y-2">
          {workers.map((w) => {
            const entry = byWorker[w.id];
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
                  {(["present", "half_day", "absent"] as AttendanceStatus[]).map((s) => {
                    const active = entry?.status === s;
                    const color =
                      s === "absent"
                        ? "bg-red-600 text-white"
                        : s === "half_day"
                          ? "bg-amber-500 text-white"
                          : "bg-emerald-600 text-white";
                    return (
                      <button
                        key={s}
                        disabled={isBusy}
                        onClick={() => mark(w, s)}
                        className={`rounded-xl py-2 text-sm font-semibold transition ${
                          active ? color : "bg-slate-100 text-slate-600 active:bg-slate-200"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
