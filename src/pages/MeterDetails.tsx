import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../context/AuthContext";
import { addSiteFlat, removeRow, saveMeterRecord } from "../lib/db";
import { todayISO } from "../lib/dates";
import { compressImage, flatSort, meterPhotoUrl, uploadMeterPhoto } from "../lib/meters";
import { buildFlatPdf, pdfFileName, sharePdf } from "../lib/pdf";
import type { MeterRecord, MeterFlatRow, SiteFlat, WorkLocation } from "../lib/types";

type Filter = "pending" | "done" | "all";

export function MeterDetailsPage() {
  const { profile } = useAuth();
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const { rows: flats, loading: flatsLoading } = useTable<SiteFlat>("site_flats");
  const { rows: records, loading: recLoading, refetch } = useTable<MeterRecord>("meter_records");

  const [siteId, setSiteId] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [editing, setEditing] = useState<SiteFlat | null>(null);
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

  const doneCount = rows.filter((r) => r.record?.status === "done").length;
  const visible = rows.filter((r) => {
    if (filter === "done") return r.record?.status === "done";
    if (filter === "pending") return r.record?.status !== "done";
    return true;
  });

  if (flatsLoading || recLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3">
        <Field label="Site">
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
            {locations.filter((l) => l.active).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
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
            <FlatRow key={r.flat.id} row={r} onOpen={() => setEditing(r.flat)} />
          ))}
        </div>
      )}

      {editing && profile ? (
        <FlatForm
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
    </div>
  );
}

function FlatRow({ row, onOpen }: { row: MeterFlatRow; onOpen: () => void }) {
  const done = row.record?.status === "done";
  return (
    <Card className="p-3">
      <button onClick={onOpen} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {row.flat.flat_number}
            {row.flat.consumer_name ? (
              <span className="ml-2 text-sm font-normal text-slate-500">{row.flat.consumer_name}</span>
            ) : null}
          </p>
          <p className="truncate text-xs text-slate-500">
            BP {row.flat.bp_number ?? "—"}
            {row.flat.application_no ? ` · App ${row.flat.application_no}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {done ? "Done" : "Pending"}
        </span>
      </button>
    </Card>
  );
}

async function compressPreview(file: File): Promise<{ blob: Blob; url: string }> {
  const blob = await compressImage(file);
  return { blob, url: URL.createObjectURL(blob) };
}

function PhotoField({
  label,
  preview,
  onChange,
}: {
  label: string;
  preview: string | null;
  onChange: (v: { blob: Blob; url: string } | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressPreview(file));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label}>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-[11px] text-slate-500">
          {preview ? (
            <img src={preview} alt={label} className="h-full w-full object-cover" />
          ) : busy ? (
            "Working…"
          ) : (
            "No photo"
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="rounded-xl bg-brand-700 px-3 py-2 text-xs font-semibold text-white active:bg-brand-800 disabled:opacity-40"
          >
            Take photo
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-200 disabled:opacity-40"
          >
            Upload
          </button>
          {preview ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-1 text-left text-xs font-semibold text-red-600 active:text-red-700"
            >
              Remove
            </button>
          ) : (
            <span className="px-1 text-[11px] text-slate-400">Required</span>
          )}
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </Field>
  );
}

function FlatForm({
  siteName,
  flat,
  record,
  profileId,
  onClose,
  onSaved,
}: {
  siteName: string;
  flat: SiteFlat;
  record: MeterRecord | null;
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reading, setReading] = useState(record?.meter_reading != null ? String(record.meter_reading) : "");
  const [initialReading, setInitialReading] = useState(
    record?.initial_meter_reading != null ? String(record.initial_meter_reading) : "",
  );
  const [make, setMake] = useState(record?.meter_make ?? "");
  const [workDate, setWorkDate] = useState(record?.work_date ?? todayISO());
  const [remarks, setRemarks] = useState(record?.remarks ?? "");
  const [meter, setMeter] = useState<{ blob: Blob; url: string } | null>(null);
  const [valve, setValve] = useState<{ blob: Blob; url: string } | null>(null);
  const [remoteMeter, setRemoteMeter] = useState<string | null>(null);
  const [remoteValve, setRemoteValve] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([meterPhotoUrl(record?.meter_photo_path ?? null), meterPhotoUrl(record?.valve_photo_path ?? null)]).then(
      ([m, v]) => {
        if (cancelled) return;
        setRemoteMeter(m);
        setRemoteValve(v);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [record?.meter_photo_path, record?.valve_photo_path]);

  const hasMeter = !!meter || (!!remoteMeter && !!record?.meter_photo_path);
  const hasValve = !!valve || (!!remoteValve && !!record?.valve_photo_path);

  const save = async () => {
    const readingNum = Number(reading);
    if (reading.trim() === "" || !Number.isFinite(readingNum)) {
      setError("Enter the meter reading (numbers only).");
      return;
    }
    const initialNum = Number(initialReading);
    if (initialReading.trim() === "" || !Number.isFinite(initialNum)) {
      setError("Enter the initial meter reading (numbers only).");
      return;
    }
    if (!make.trim()) {
      setError("Enter the meter make.");
      return;
    }
    if (!hasMeter) {
      setError("Add the meter photo.");
      return;
    }
    if (!hasValve) {
      setError("Add the valve photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const meterPath = meter
        ? await uploadMeterPhoto(flat.location_id, flat.id, "meter", meter.blob)
        : record!.meter_photo_path!;
      const valvePath = valve
        ? await uploadMeterPhoto(flat.location_id, flat.id, "valve", valve.blob)
        : record!.valve_photo_path!;
      await saveMeterRecord({
        site_flat_id: flat.id,
        location_id: flat.location_id,
        meter_reading: readingNum,
        initial_meter_reading: initialNum,
        meter_make: make.trim(),
        work_date: workDate,
        remarks: remarks.trim() || null,
        meter_photo_path: meterPath,
        valve_photo_path: valvePath,
        status: "done",
        created_by_profile_id: profileId,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const download = async () => {
    if (!record) return;
    setPdfBusy(true);
    try {
      const doc = await buildFlatPdf(siteName, flat, record);
      const name = pdfFileName(siteName, flat.flat_number);
      const res = await sharePdf(doc, name);
      if (res === "downloaded") setError("PDF saved to your device.");
    } finally {
      setPdfBusy(false);
    }
  };

  const del = async () => {
    if (!record) return;
    setBusy(true);
    try {
      await removeRow("meter_records", record.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Flat ${flat.flat_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <Row label="Consumer" value={flat.consumer_name ?? "—"} />
          <Row label="BP number" value={flat.bp_number ?? "—"} />
          <Row label="Application no." value={flat.application_no ?? "—"} />
          <Row label="Tower / floor" value={`${flat.tower ?? "—"} · ${flat.floor ?? "—"}`} />
        </div>

        <Field label="Meter reading">
          <input
            inputMode="decimal"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            className={inputClass}
            placeholder="e.g. 00123.450"
          />
        </Field>
        <Field label="Initial meter reading">
          <input
            inputMode="decimal"
            value={initialReading}
            onChange={(e) => setInitialReading(e.target.value)}
            className={inputClass}
            placeholder="e.g. 00120.000"
          />
        </Field>
        <Field label="Meter make">
          <input value={make} onChange={(e) => setMake(e.target.value)} className={inputClass} placeholder="e.g. Itron / Elster" />
        </Field>
        <Field label="Work date">
          <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputClass} />
        </Field>

        <PhotoField label="Meter photo" preview={meter?.url ?? remoteMeter} onChange={setMeter} />
        <PhotoField label="Valve / regulator photo (on)" preview={valve?.url ?? remoteValve} onChange={setValve} />

        <Field label="Remarks (optional)">
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} placeholder="e.g. regulator replaced" />
        </Field>

        {error ? <p className="text-sm text-slate-600">{error}</p> : null}

        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : record ? "Save changes" : "Save meter details"}
        </Button>

        {record ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={download} disabled={pdfBusy} className="flex-1">
              {pdfBusy ? "Building…" : "Download PDF"}
            </Button>
            <Button variant="danger" onClick={del} disabled={busy} className="flex-1">
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
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
