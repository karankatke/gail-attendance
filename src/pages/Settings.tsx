import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { approveAccess, insertRow, rejectAccess, removeRow, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { formatINR, hasEffectiveRate } from "../lib/pay";
import { timeAgo } from "../lib/dates";
import type { Profile, Role, Worker, WorkLocation } from "../lib/types";
import { WorkersSection } from "./Workers";
import { SitesSection } from "./Sites";

const STATUS_LABEL: Record<string, string> = {
  unclaimed: "Not set up",
  pending: "Requested access",
  approved: "Approved — setting PIN",
  active: "Active",
};

type MoreTab = "people" | "sites" | "admin";

const TABS: { id: MoreTab; label: string }[] = [
  { id: "people", label: "People" },
  { id: "sites", label: "Sites" },
  { id: "admin", label: "Admin" },
];

export function MorePage() {
  const [tab, setTab] = useState<MoreTab>("people");
  const [open, setOpen] = useState<string | null>(null);

  const { rows: workers, loading: workersLoading, refetch: refetchWorkers } = useTable<Worker>("workers", {
    orderColumn: "name",
  });
  const { rows: roles, loading: rolesLoading, refetch: refetchRoles } = useTable<Role>("roles", {
    orderColumn: "name",
  });
  const { rows: profiles, refetch: refetchProfiles } = useTable<Profile>("profiles", {
    orderColumn: "display_name",
  });
  const { rows: sites, loading: sitesLoading, refetch: refetchSites } = useTable<WorkLocation>("locations", {
    orderColumn: "name",
  });

  const roleById = useMemo(() => {
    const m: Record<string, Role> = {};
    for (const r of roles) m[r.id] = r;
    return m;
  }, [roles]);

  const activeWorkers = workers.filter((w) => w.active).length;
  const needsRate = workers.filter(
    (w) => w.active && !hasEffectiveRate(w, w.role_id ? roleById[w.role_id] ?? null : null),
  ).length;
  const team = profiles.filter((p) => p.role === "supervisor" && p.active);
  const pending = team.filter((p) => p.status === "pending").length;
  const activeSites = sites.filter((l) => l.active).length;

  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));
  const switchTab = (t: MoreTab) => {
    setTab(t);
    setOpen(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium text-slate-400">App status</p>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`rounded-lg py-2 text-sm font-semibold ${
              tab === t.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "people" ? (
        <>
          <MoreSection
            title="Workers"
            summary={`${activeWorkers} active${needsRate ? ` · ${needsRate} need rate` : ""}`}
            open={open === "workers"}
            onToggle={() => toggle("workers")}
          >
            <WorkersSection
              workers={workers}
              roles={roles}
              profiles={profiles}
              loading={workersLoading}
              onRefetch={refetchWorkers}
            />
          </MoreSection>

          <MoreSection
            title="Supervisors & access"
            summary={`${team.length} supervisor${team.length === 1 ? "" : "s"}${
              pending ? ` · ${pending} requested` : ""
            }`}
            open={open === "access"}
            onToggle={() => toggle("access")}
          >
            <SupervisorsSection profiles={profiles} onRefetch={refetchProfiles} />
          </MoreSection>
        </>
      ) : null}

      {tab === "sites" ? (
        <MoreSection
          title="Sites"
          summary={`${activeSites} active`}
          open={open === "sites"}
          onToggle={() => toggle("sites")}
        >
          <SitesSection sites={sites} loading={sitesLoading} onRefetch={refetchSites} />
        </MoreSection>
      ) : null}

      {tab === "admin" ? (
        <>
          <MoreSection
            title="Roles & base rates"
            summary={`${roles.length} role${roles.length === 1 ? "" : "s"}`}
            open={open === "roles"}
            onToggle={() => toggle("roles")}
          >
            <RolesSection roles={roles} loading={rolesLoading} onRefetch={refetchRoles} />
          </MoreSection>
          <AccountCard />
        </>
      ) : null}
    </div>
  );
}

function MoreSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-500">{summary}</p>
        </div>
        <span className="shrink-0 text-slate-400">{open ? "▴" : "▾"}</span>
      </button>
      {open ? <div className="border-t border-slate-100 p-3">{children}</div> : null}
    </Card>
  );
}

function SupervisorsSection({
  profiles,
  onRefetch,
}: {
  profiles: Profile[];
  onRefetch: () => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const team = profiles.filter((p) => p.role === "supervisor" && p.active);

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusyId(id);
    try {
      await fn(id);
      await onRefetch();
    } finally {
      setBusyId(null);
    }
  };

  if (team.length === 0) {
    return <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No supervisors yet.</p>;
  }

  return (
    <div className="space-y-2">
      {team.map((p) => (
        <Card key={p.id} className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{p.display_name}</p>
              <p className="text-xs text-slate-500">
                {STATUS_LABEL[p.status] ?? p.status}
                {p.status === "active" ? ` · seen ${timeAgo(p.last_seen_at)}` : ""}
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
      ))}
    </div>
  );
}

function RolesSection({
  roles,
  loading,
  onRefetch,
}: {
  roles: Role[];
  loading: boolean;
  onRefetch: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<Role | "new" | null>(null);

  return (
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
      {editing ? (
        <RoleForm
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onRefetch();
          }}
        />
      ) : null}
    </div>
  );
}

function AccountCard() {
  const { signOut, profile: me } = useAuth();
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-slate-900">
        Signed in as {me?.display_name ?? "owner"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Each person signs in with their own PIN. Supervisors only see attendance, bata and meter details.
      </p>
      <Button variant="danger" onClick={signOut} className="mt-3 w-full">
        Sign out on this phone
      </Button>
    </Card>
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
