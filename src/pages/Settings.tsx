import { useState } from "react";
import { Button, Card, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { insertRow, removeRow, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { formatINR } from "../lib/pay";
import type { Role } from "../lib/types";

export function SettingsPage() {
  const { rows: roles, loading, refetch } = useTable<Role>("roles", { orderColumn: "name" });
  const { signOut } = useAuth();
  const [editing, setEditing] = useState<Role | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 px-1 text-sm font-medium text-slate-500">Roles & base rates</p>
        <div className="space-y-2">
          {loading ? (
            <Spinner />
          ) : (
            roles.map((r) => (
              <Card key={r.id} className="p-3">
                <button onClick={() => setEditing(r)} className="flex w-full items-center justify-between text-left">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {r.name}
                      {!r.active ? <span className="ml-2 text-xs font-normal text-slate-400">inactive</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatINR(Number(r.day_rate))}/day · {formatINR(Number(r.hour_rate))}/hr
                    </p>
                  </div>
                  <span className="text-slate-300">›</span>
                </button>
              </Card>
            ))
          )}
          <Button variant="secondary" onClick={() => setEditing("new")} className="w-full">
            + Add role
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-slate-900">Shared access</p>
        <p className="mt-1 text-xs text-slate-500">
          Everyone signs in with the same link and PIN. You stay signed in on each phone. To change the
          PIN, update the password of the shared Supabase user.
        </p>
        <Button variant="danger" onClick={signOut} className="mt-3 w-full">
          Sign out on this phone
        </Button>
      </Card>

      <p className="pb-2 text-center text-[11px] text-slate-400">Attendance Register · v1.0</p>

      {editing ? (
        <RoleForm
          role={editing === "new" ? null : editing}
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

function RoleForm({
  role,
  onClose,
  onSaved,
}: {
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [dayRate, setDayRate] = useState(role ? String(role.day_rate) : "");
  const [hourRate, setHourRate] = useState(role ? String(role.hour_rate) : "");
  const [active, setActive] = useState(role?.active ?? true);
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
      day_rate: dayRate.trim() === "" ? 0 : Number(dayRate),
      hour_rate: hourRate.trim() === "" ? 0 : Number(hourRate),
      active,
    };
    try {
      if (role) await updateRow("roles", role.id, payload);
      else await insertRow("roles", payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await removeRow("roles", role.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <Modal title={role ? "Edit role" : "Add role"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Role name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Plumber" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day rate (₹)">
            <input inputMode="decimal" value={dayRate} onChange={(e) => setDayRate(e.target.value)} className={inputClass} placeholder="0" />
          </Field>
          <Field label="Hour rate (₹)">
            <input inputMode="decimal" value={hourRate} onChange={(e) => setHourRate(e.target.value)} className={inputClass} placeholder="0" />
          </Field>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-slate-700">Active</span>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save"}
          </Button>
          {role ? (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
