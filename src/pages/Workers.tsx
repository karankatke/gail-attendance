import { useMemo, useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { insertRow, removeRow, updateRow } from "../lib/db";
import { formatRate } from "../lib/pay";
import type { Profile, RateMode, Role, Worker } from "../lib/types";

export function WorkersPage() {
  const { rows: workers, loading, refetch } = useTable<Worker>("workers", { orderColumn: "name" });
  const { rows: roles } = useTable<Role>("roles", { orderColumn: "name" });
  const { rows: profiles, refetch: refetchProfiles } = useTable<Profile>("profiles", {
    orderColumn: "display_name",
  });
  const [editing, setEditing] = useState<Worker | "new" | null>(null);

  const roleById = useMemo(() => {
    const m: Record<string, Role> = {};
    for (const r of roles) m[r.id] = r;
    return m;
  }, [roles]);

  const addedByName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profiles) m[p.id] = p.display_name;
    return m;
  }, [profiles]);

  const sorted = useMemo(
    () => [...workers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [workers],
  );

  const needsRate = useMemo(() => sorted.filter((w) => w.active && w.needs_rate), [sorted]);

  const onSaved = async () => {
    setEditing(null);
    await refetch();
    await refetchProfiles();
  };

  return (
    <div className="space-y-4">
      {needsRate.length > 0 ? (
        <div>
          <p className="mb-2 px-1 text-sm font-medium text-amber-700">
            New workers — set their rate ({needsRate.length})
          </p>
          <div className="space-y-2">
            {needsRate.map((w) => {
              const role = w.role_id ? roleById[w.role_id] : null;
              const by = w.added_by_profile_id ? addedByName[w.added_by_profile_id] : null;
              return (
                <Card key={w.id} className="border-amber-200 p-3 ring-amber-100">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{w.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {role?.name ?? "No role"}
                        {by ? ` · added by ${by}` : ""}
                      </p>
                    </div>
                    <Button onClick={() => setEditing(w)} className="shrink-0 px-3 py-1.5 text-xs">
                      Set rate
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      <Button onClick={() => setEditing("new")} className="w-full">
        + Add worker
      </Button>

      {loading ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <Empty title="No workers yet" hint="Tap “Add worker” to get started." />
      ) : (
        <div className="space-y-2">
          {sorted.map((w) => {
            const role = w.role_id ? roleById[w.role_id] : null;
            const by = w.added_by_profile_id ? addedByName[w.added_by_profile_id] : null;
            return (
              <Card key={w.id} className="p-3">
                <button onClick={() => setEditing(w)} className="flex w-full items-center justify-between text-left">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {w.name}
                      {!w.active ? <span className="ml-2 text-xs font-normal text-slate-400">inactive</span> : null}
                      {w.needs_rate ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          needs rate
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {role?.name ?? "No role"} · {formatRate(w, role)}
                      {by ? ` · added by ${by}` : ""}
                    </p>
                  </div>
                  <span className="text-slate-300">›</span>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {editing ? (
        <WorkerForm
          worker={editing === "new" ? null : editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function WorkerForm({
  worker,
  roles,
  onClose,
  onSaved,
}: {
  worker: Worker | null;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(worker?.name ?? "");
  const [phone, setPhone] = useState(worker?.phone ?? "");
  const [roleId, setRoleId] = useState(worker?.role_id ?? roles[0]?.id ?? "");
  const [rateMode, setRateMode] = useState<RateMode>(worker?.rate_mode ?? "day");
  const [dayRate, setDayRate] = useState(worker?.day_rate != null ? String(worker.day_rate) : "");
  const [monthRate, setMonthRate] = useState(worker?.month_rate != null ? String(worker.month_rate) : "");
  const [active, setActive] = useState(worker?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      phone: phone.trim() === "" ? null : phone.trim(),
      role_id: roleId || null,
      rate_mode: rateMode,
      day_rate: dayRate.trim() === "" ? null : Number(dayRate),
      month_rate: monthRate.trim() === "" ? null : Number(monthRate),
      active,
      needs_rate: false,
    };
    try {
      if (worker) await updateRow("workers", worker.id, payload);
      else await insertRow("workers", payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!worker) return;
    setBusy(true);
    try {
      await removeRow("workers", worker.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <Modal title={worker ? "Edit worker" : "Add worker"} onClose={onClose}>
      <div className="space-y-4">
        {worker?.needs_rate ? (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            {worker.added_by_profile_id ? "Added by a supervisor. " : ""}
            Set the pay basis and rate below, then save.
          </p>
        ) : null}

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Worker name" />
        </Field>

        <Field label="Phone (optional)">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} placeholder="Phone number" />
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

        <Field label="Pay basis">
          <div className="grid grid-cols-2 gap-1.5">
            {(["day", "month"] as RateMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setRateMode(m)}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  rateMode === m ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {m === "day" ? "Per day" : "Per month"}
              </button>
            ))}
          </div>
        </Field>

        {rateMode === "day" ? (
          <Field label="Day rate override (₹)" hint="blank = use the role's day rate">
            <input inputMode="decimal" value={dayRate} onChange={(e) => setDayRate(e.target.value)} className={inputClass} placeholder="—" />
          </Field>
        ) : (
          <Field label="Month rate override (₹)" hint="blank = use the role's month rate">
            <input inputMode="decimal" value={monthRate} onChange={(e) => setMonthRate(e.target.value)} className={inputClass} placeholder="—" />
          </Field>
        )}

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-slate-700">Active (show on attendance screen)</span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save"}
          </Button>
          {worker ? (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
