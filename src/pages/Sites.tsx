import { useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { insertRow, removeRow, updateRow } from "../lib/db";
import type { WorkLocation } from "../lib/types";

export function SitesPage() {
  const { rows, loading, refetch } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const [editing, setEditing] = useState<WorkLocation | "new" | null>(null);

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing("new")} className="w-full">
        + Add site
      </Button>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title="No sites yet" hint="Add the locations where work happens." />
      ) : (
        <div className="space-y-2">
          {rows.map((l) => (
            <Card key={l.id} className="p-3">
              <button onClick={() => setEditing(l)} className="flex w-full items-center justify-between text-left">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {l.name}
                    {!l.active ? <span className="ml-2 text-xs font-normal text-slate-400">inactive</span> : null}
                  </p>
                  {l.address ? <p className="truncate text-xs text-slate-500">{l.address}</p> : null}
                </div>
                <span className="text-slate-300">›</span>
              </button>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <SiteForm
          site={editing === "new" ? null : editing}
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

function SiteForm({
  site,
  onClose,
  onSaved,
}: {
  site: WorkLocation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(site?.name ?? "");
  const [address, setAddress] = useState(site?.address ?? "");
  const [active, setActive] = useState(site?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = { name: name.trim(), address: address.trim() || null, active };
    try {
      if (site) await updateRow("locations", site.id, payload);
      else await insertRow("locations", payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!site) return;
    setBusy(true);
    try {
      await removeRow("locations", site.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <Modal title={site ? "Edit site" : "Add site"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Site name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Site A / Kothrud plot" />
        </Field>
        <Field label="Address (optional)">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="Address or landmark" />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-slate-700">Active</span>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save"}
          </Button>
          {site ? (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
