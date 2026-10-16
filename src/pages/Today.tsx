import { useMemo, useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { useAttendance } from "../hooks/useAttendance";
import { deleteAttendance, saveAttendance } from "../lib/db";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import { formatINR, suggestPay } from "../lib/pay";
import type { Attendance, AttendanceStatus, Role, Worker, WorkLocation } from "../lib/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Full",
  half_day: "Half",
  absent: "Absent",
};

export function TodayPage() {
  const [date, setDate] = useState(todayISO());
  const [locationId, setLocationId] = useState<string>("");
  const [busyWorker, setBusyWorker] = useState<string | null>(null);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { rows: workers, loading: wLoading } = useTable<Worker>("workers", {
    orderColumn: "name",
  });
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const { rows: roles } = useTable<Role>("roles", { orderColumn: "name" });
  const { byWorker, refetch } = useAttendance(date);

  const activeLocations = useMemo(() => locations.filter((l) => l.active), [locations]);
  const activeWorkers = useMemo(() => workers.filter((w) => w.active), [workers]);
  const roleById = useMemo(() => {
    const m: Record<string, Role> = {};
    for (const r of roles) m[r.id] = r;
    return m;
  }, [roles]);

  const currentLocationId = locationId || activeLocations[0]?.id || "";

  const mark = async (worker: Worker, status: AttendanceStatus) => {
    setError(null);
    setBusyWorker(worker.id);
    try {
      const role = worker.role_id ? roleById[worker.role_id] ?? null : null;
      const existing = byWorker[worker.id];
      const hours = existing?.hours ?? null;
      const pay = suggestPay(worker, role, status, hours);
      await saveAttendance({
        worker_id: worker.id,
        work_date: date,
        location_id: currentLocationId || null,
        role_id: worker.role_id,
        status,
        hours,
        pay_amount: pay,
        pay_overridden: existing?.pay_overridden ?? false,
        note: existing?.note ?? null,
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
    const pending = activeWorkers.filter((w) => !byWorker[w.id]);
    if (pending.length === 0) return;
    try {
      for (const w of pending) {
        const role = w.role_id ? roleById[w.role_id] ?? null : null;
        await saveAttendance({
          worker_id: w.id,
          work_date: date,
          location_id: currentLocationId || null,
          role_id: w.role_id,
          status: "present",
          hours: null,
          pay_amount: suggestPay(w, role, "present", null),
          pay_overridden: false,
          note: null,
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
                    currentLocationId === l.id
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Add a site under the Sites tab so you can tag where work happens.
          </p>
        )}
      </Card>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {activeWorkers.length > 0 ? (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-medium text-slate-500">
            {activeWorkers.length} workers
          </p>
          <Button variant="ghost" onClick={markAllPresent}>
            Mark rest present
          </Button>
        </div>
      ) : null}

      {wLoading ? (
        <Spinner />
      ) : activeWorkers.length === 0 ? (
        <Empty title="No workers yet" hint="Add workers under the Workers tab." />
      ) : (
        <div className="space-y-2">
          {activeWorkers.map((w) => {
            const role = w.role_id ? roleById[w.role_id] : null;
            const entry = byWorker[w.id];
            const isBusy = busyWorker === w.id;
            return (
              <Card key={w.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{w.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {role?.name ?? "No role"}
                      {entry ? ` · ${formatINR(entry.pay_amount)}` : ""}
                      {entry?.pay_overridden ? " (edited)" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing(w)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 active:bg-brand-50"
                  >
                    {entry ? "Edit" : "Details"}
                  </button>
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

                {entry?.note ? (
                  <p className="mt-2 text-xs italic text-slate-400">{entry.note}</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {editing ? (
        <EditEntry
          worker={editing}
          role={editing.role_id ? roleById[editing.role_id] ?? null : null}
          entry={byWorker[editing.id]}
          locationId={currentLocationId || null}
          date={date}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function EditEntry({
  worker,
  role,
  entry,
  locationId,
  date,
  onClose,
  onSaved,
}: {
  worker: Worker;
  role: Role | null;
  entry: Attendance | undefined;
  locationId: string | null;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(entry?.status ?? "present");
  const [hours, setHours] = useState(entry?.hours != null ? String(entry.hours) : "");
  const [pay, setPay] = useState(
    entry ? String(entry.pay_amount) : String(suggestPay(worker, role, "present", null)),
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [payEdited, setPayEdited] = useState(entry?.pay_overridden ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalc = (nextStatus: AttendanceStatus, hoursStr: string) => {
    const h = hoursStr.trim() === "" ? null : Number(hoursStr);
    const suggested = suggestPay(worker, role, nextStatus, Number.isFinite(h as number) ? h : null);
    setPay(String(suggested));
    setPayEdited(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const h = hours.trim() === "" ? null : Number(hours);
      const amount = pay.trim() === "" ? 0 : Number(pay);
      await saveAttendance({
        worker_id: worker.id,
        work_date: date,
        location_id: locationId,
        role_id: worker.role_id,
        status,
        hours: h != null && Number.isFinite(h) ? h : null,
        pay_amount: Number.isFinite(amount) ? amount : 0,
        pay_overridden: payEdited,
        note: note.trim() === "" ? null : note.trim(),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!entry) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await deleteAttendance(entry.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove");
      setBusy(false);
    }
  };

  return (
    <Modal title={worker.name} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Status">
          <div className="grid grid-cols-3 gap-1.5">
            {(["present", "half_day", "absent"] as AttendanceStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  recalc(s, hours);
                }}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  status === s ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Hours worked" hint={`${worker.rate_mode === "hour" ? "Hourly rate" : "Day rate"} worker`}>
          <input
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder={worker.rate_mode === "hour" ? "e.g. 8" : "optional"}
            className={inputClass}
          />
        </Field>

        <Field label="Pay for this day (₹)" hint="Pre-filled from the rate — edit for partial days.">
          <input
            inputMode="decimal"
            value={pay}
            onChange={(e) => {
              setPay(e.target.value);
              setPayEdited(true);
            }}
            className={inputClass}
          />
        </Field>

        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. left early, digging only"
            className={inputClass}
          />
        </Field>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save"}
          </Button>
          {entry ? (
            <Button variant="danger" onClick={clear} disabled={busy}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
