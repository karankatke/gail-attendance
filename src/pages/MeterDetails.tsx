import { useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { FlatEditForm as EditFlatForm } from "../components/FlatEditForm";
import { MeterRecordForm } from "../components/MeterRecordForm";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../context/AuthContext";
import { addSiteFlat } from "../lib/db";
import { flatSort, isRecordComplete, missingMeterFields } from "../lib/meters";
import type { MeterRecord, MeterFlatRow, SiteFlat, WorkLocation } from "../lib/types";

type Filter = "pending" | "done" | "all";

export function MeterDetailsPage() {
  const { profile } = useAuth();
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const { rows: flats, loading: flatsLoading, refetch: refetchFlats } = useTable<SiteFlat>("site_flats");
  const { rows: records, loading: recLoading, refetch } = useTable<MeterRecord>("meter_records");

  const [siteId, setSiteId] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [editing, setEditing] = useState<SiteFlat | null>(null);
  const [editingFlat, setEditingFlat] = useState<SiteFlat | null>(null);
  const [adding, setAdding] = useState(false);

  const sitesWithFlats = useMemo(() => {
    const ids = new Set(flats.map((f) => f.location_id));
    return locations.filter((l) => l.active && ids.has(l.id));
  }, [flats, locations]);

  useEffect(() => {
    if (siteId) return;
    if (sitesWithFlats.length) setSiteId(sitesWithFlats[0].id);
    else if (locations.length) setSiteId(locations.filter((l) => l.active)[0]?.id ?? locations[0].id);
  }, [siteId, sitesWithFlats, locations]);

  const siteName = locations.find((l) => l.id === siteId)?.name ?? "";

  const recordByFlat = useMemo(() => {
    const m = new Map<string, MeterRecord>();
    for (const r of records) m.set(r.site_flat_id, r);
    return m;
  }, [records]);

  const rows = useMemo<MeterFlatRow[]>(() => {
    return flats
      .filter((f) => f.location_id === siteId && f.active)
      .sort(flatSort)
      .map((flat) => ({ flat, record: recordByFlat.get(flat.id) ?? null }));
  }, [flats, siteId, recordByFlat]);

  const doneCount = rows.filter((r) => isRecordComplete(r.record)).length;
  const visible = rows.filter((r) => {
    if (filter === "done") return isRecordComplete(r.record);
    if (filter === "pending") return !isRecordComplete(r.record);
    return true;
  });

  const pendingBySite = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flats) {
      if (!f.active) continue;
      if (!isRecordComplete(recordByFlat.get(f.id) ?? null)) {
        m.set(f.location_id, (m.get(f.location_id) ?? 0) + 1);
      }
    }
    return m;
  }, [flats, recordByFlat]);

  if (flatsLoading || recLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3">
        <Field label="Site">
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
            {locations.filter((l) => l.active).map((l) => {
              const pending = pendingBySite.get(l.id) ?? 0;
              return (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {pending ? ` (${pending} pending)` : ""}
                </option>
              );
            })}
          </select>
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Meter details recorded</span>
            <span>
              {doneCount} of {rows.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: rows.length ? `${(doneCount / rows.length) * 100}%` : "0%" }}
            />
          </div>
          {rows.length - doneCount > 0 ? (
            <p className="mt-1 text-[11px] text-slate-400">
              {rows.length - doneCount} flat{rows.length - doneCount === 1 ? "" : "s"} with missing
              details
            </p>
          ) : null}
        </div>
      </Card>

      <div className="flex gap-1.5">
        {(["pending", "done", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold capitalize ${
              filter === f ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Button variant="secondary" onClick={() => setAdding(true)} className="w-full">
        + Add a flat not in the list
      </Button>

      {visible.length === 0 ? (
        <Empty
          title={rows.length === 0 ? "No flats for this site" : "Nothing here"}
          hint={rows.length === 0 ? "Add a flat to start recording meter details." : "Try another tab."}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <FlatRow
              key={r.flat.id}
              row={r}
              onOpen={() => setEditing(r.flat)}
              onEdit={() => setEditingFlat(r.flat)}
            />
          ))}
        </div>
      )}

      {editing && profile ? (
        <MeterRecordForm
          siteName={siteName}
          flat={editing}
          record={recordByFlat.get(editing.id) ?? null}
          profileId={profile.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refetch();
          }}
        />
      ) : null}

      {adding && profile ? (
        <AddFlatForm
          locationId={siteId}
          profileId={profile.id}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refetch();
          }}
        />
      ) : null}

      {editingFlat ? (
        <EditFlatForm
          flat={editingFlat}
          hasRecord={!!recordByFlat.get(editingFlat.id)}
          onClose={() => setEditingFlat(null)}
          onSaved={async () => {
            setEditingFlat(null);
            await refetchFlats();
          }}
        />
      ) : null}
    </div>
  );
}

function FlatRow({
  row,
  onOpen,
  onEdit,
}: {
  row: MeterFlatRow;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const done = isRecordComplete(row.record);
  const missing = missingMeterFields(row.record);
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="font-semibold text-slate-900">
            {row.flat.flat_number}
            {row.flat.consumer_name ? (
              <span className="ml-2 text-sm font-normal text-slate-500">{row.flat.consumer_name}</span>
            ) : null}
          </p>
          <p className="truncate text-xs text-slate-500">
            BP {row.flat.bp_number ?? "-"}
            {row.flat.application_no ? ` · App ${row.flat.application_no}` : ""}
          </p>
          {!done && missing.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {missing.slice(0, 3).map((m) => (
                <span
                  key={m}
                  className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                >
                  {m}
                </span>
              ))}
              {missing.length > 3 ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  +{missing.length - 3} more
                </span>
              ) : null}
            </div>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {row.flat.source === "manual" ? (
            <button
              onClick={onEdit}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 active:bg-brand-50"
            >
              Edit
            </button>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {done ? "Done" : "Pending"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function AddFlatForm({
  locationId,
  profileId,
  onClose,
  onSaved,
}: {
  locationId: string;
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flatNumber, setFlatNumber] = useState("");
  const [bpNumber, setBpNumber] = useState("");
  const [consumerName, setConsumerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const num = flatNumber.trim().toUpperCase();
    if (!num) {
      setError("Enter the flat number.");
      return;
    }
    const tower = num.match(/^[A-Z]/)?.[0] ?? null;
    const digits = Number(num.replace(/\D/g, ""));
    setBusy(true);
    setError(null);
    try {
      await addSiteFlat({
        location_id: locationId,
        flat_number: num,
        flat_key: num.replace(/[^A-Z0-9]/g, ""),
        tower,
        floor: Number.isFinite(digits) && digits > 0 ? Math.floor(digits / 100) : null,
        bp_number: bpNumber.trim() || null,
        consumer_name: consumerName.trim() || null,
        created_by_profile_id: profileId,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the flat");
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a flat" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Flat number" hint="e.g. B-1901">
          <input value={flatNumber} onChange={(e) => setFlatNumber(e.target.value)} className={inputClass} placeholder="B-1901" />
        </Field>
        <Field label="Consumer name (optional)">
          <input value={consumerName} onChange={(e) => setConsumerName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="BP number (optional)">
          <input value={bpNumber} onChange={(e) => setBpNumber(e.target.value)} className={inputClass} />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Adding…" : "Add flat"}
        </Button>
      </div>
    </Modal>
  );
}

