import { useMemo, useState } from "react";
import { Button, Card, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { approveAccess, insertRow, rejectAccess, removeRow, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { formatINR } from "../lib/pay";
import { timeAgo } from "../lib/dates";
import type { Profile, Role } from "../lib/types";

const STATUS_LABEL: Record<string, string> = {
  unclaimed: "Not set up",
  pending: "Requested access",
  approved: "Approved — setting PIN",
  active: "Active",
};

export function SettingsPage() {
  const { rows: roles, loading, refetch } = useTable<Role>("roles", { orderColumn: "name" });
  const { rows: profiles, refetch: refetchProfiles } = useTable<Profile>("profiles", {
    orderColumn: "display_name",
  });
  const { signOut, profile: me } = useAuth();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const team = useMemo(
    () => profiles.filter((p) => p.role === "supervisor" && p.active),
    [profiles],
  );

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusyId(id);
    try {
      await fn(id);
      await refetchProfiles();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 px-1 text-sm font-medium text-slate-500">Supervisors & access</p>
        <div className="space-y-2">
          {team.length === 0 ? (
            <Card className="p-4 text-sm text-slate-500">No supervisors yet.</Card>
          ) : (
            team.map((p) => (
              <Card key={p.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{p.display_name}</p>
                    <p className="text-xs text-slate-500">
                      {STATUS_LABEL[p.status] ?? p.status}
                      {p.status === "active" ? ` · active ${timeAgo(p.last_seen_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {p.status === "pending" ? (
                      <>
                        <Button
                          onClick={() => act(p.id, approveAccess)}
                          disabled={busyId === p.id}
                          className="px-3 py-1.5 text-xs"
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => act(p.id, rejectAccess)}
                          disabled={busyId === p.id}
                          className="px-3 py-1.5 text-xs"
                        >
                          Reject
                        </Button>
                      </>
                    ) : p.status === "active" ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

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
                      {formatINR(Number(r.day_rate))}/day · {formatINR(Number(r.month_rate))}/month
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
        <p className="text-sm font-semibold text-slate-900">
          Signed in as {me?.display_name ?? "owner"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Each person signs in with their own PIN. Supervisors only see attendance and bata.
        </p>
        <Button variant="danger" onClick={signOut} className="mt-3 w-full">
          Sign out on this phone
        </Button>
      </Card>

      <p className="pb-2 text-center text-[11px] text-slate-400">Attendance Register · v2.0</p>

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
  const [monthRate, setMonthRate] = useState(role ? String(role.month_rate) : "");
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
      month_rate: monthRate.trim() === "" ? 0 : Number(monthRate),
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
          <Field label="Month rate (₹)">
            <input inputMode="decimal" value={monthRate} onChange={(e) => setMonthRate(e.target.value)} className={inputClass} placeholder="0" />
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
