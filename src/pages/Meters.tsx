import { useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Modal, Spinner } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { flatSort, meterPhotoUrl } from "../lib/meters";
import { buildFlatPdf, buildSitePdf, pdfFileName, sharePdf } from "../lib/pdf";
import type { MeterFlatRow, MeterRecord, SiteFlat, WorkLocation } from "../lib/types";

export function MetersPage() {
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const { rows: flats, loading: flatsLoading } = useTable<SiteFlat>("site_flats");
  const { rows: records, loading: recLoading } = useTable<MeterRecord>("meter_records");
  const [openSite, setOpenSite] = useState<string | null>(null);

  const recordByFlat = useMemo(() => {
    const m = new Map<string, MeterRecord>();
    for (const r of records) m.set(r.site_flat_id, r);
    return m;
  }, [records]);

  const flatsBySite = useMemo(() => {
    const m = new Map<string, SiteFlat[]>();
    for (const f of flats) {
      if (!f.active) continue;
      const list = m.get(f.location_id) ?? [];
      list.push(f);
      m.set(f.location_id, list);
    }
    return m;
  }, [flats]);

  if (flatsLoading || recLoading) return <Spinner />;

  if (openSite) {
    const loc = locations.find((l) => l.id === openSite);
    const rows: MeterFlatRow[] = (flatsBySite.get(openSite) ?? [])
      .sort(flatSort)
      .map((flat) => ({ flat, record: recordByFlat.get(flat.id) ?? null }));
    return (
      <SiteMeters
        siteName={loc?.name ?? "Site"}
        rows={rows}
        onBack={() => setOpenSite(null)}
      />
    );
  }

  const siteIds = Array.from(flatsBySite.keys()).sort((a, b) => {
    const na = locations.find((l) => l.id === a)?.name ?? "";
    const nb = locations.find((l) => l.id === b)?.name ?? "";
    return na.localeCompare(nb);
  });

  if (siteIds.length === 0) {
    return <Empty title="No meter flat lists yet" hint="Flat lists are imported per site." />;
  }

  return (
    <div className="space-y-3">
      {siteIds.map((id) => {
        const name = locations.find((l) => l.id === id)?.name ?? "Site";
        const siteFlats = flatsBySite.get(id) ?? [];
        const done = siteFlats.filter((f) => recordByFlat.get(f.id)?.status === "done").length;
        const pct = siteFlats.length ? (done / siteFlats.length) * 100 : 0;
        return (
          <Card key={id} className="p-3">
            <button onClick={() => setOpenSite(id)} className="w-full text-left">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{name}</p>
                <span className="text-sm font-semibold text-slate-500">
                  {done} / {siteFlats.length}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {siteFlats.length - done} pending · tap to view
              </p>
            </button>
          </Card>
        );
      })}
    </div>
  );
}

function SiteMeters({
  siteName,
  rows,
  onBack,
}: {
  siteName: string;
  rows: MeterFlatRow[];
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doneRows = rows.filter((r) => r.record?.status === "done") as { flat: SiteFlat; record: MeterRecord }[];

  const combined = async () => {
    if (doneRows.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: doneRows.length });
    try {
      const doc = await buildSitePdf(siteName, doneRows, (done, total) => setProgress({ done, total }));
      await sharePdf(doc, pdfFileName(siteName));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the PDF");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, MeterFlatRow[]>();
    for (const r of rows) {
      const key = r.flat.tower ?? "—";
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-semibold text-brand-700">
        ← All sites
      </button>

      <Card className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-900">{siteName}</p>
          <span className="text-sm font-semibold text-slate-500">
            {doneRows.length} / {rows.length} done
          </span>
        </div>
        <Button onClick={combined} disabled={busy || doneRows.length === 0} className="w-full">
          {busy
            ? progress
              ? `Building… ${progress.done}/${progress.total}`
              : "Building…"
            : `Download combined PDF (${doneRows.length})`}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </Card>

      {rows.length === 0 ? (
        <Empty title="No flats" hint="This site has no flat list yet." />
      ) : (
        <div className="space-y-4">
          {groups.map(([tower, list]) => (
            <div key={tower}>
              <p className="mb-1.5 px-1 text-sm font-medium text-slate-500">Tower {tower}</p>
              <div className="space-y-2">
                {list.map((r) => (
                  <OwnerRow key={r.flat.id} row={r} siteName={siteName} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnerRow({ row, siteName }: { row: MeterFlatRow; siteName: string }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const done = row.record?.status === "done";

  useEffect(() => {
    let cancelled = false;
    meterPhotoUrl(row.record?.meter_photo_path ?? null).then((u) => {
      if (!cancelled) setThumb(u);
    });
    return () => {
      cancelled = true;
    };
  }, [row.record?.meter_photo_path]);

  const pdf = async () => {
    if (!row.record) return;
    setBusy(true);
    try {
      const doc = await buildFlatPdf(siteName, row.flat, row.record);
      await sharePdf(doc, pdfFileName(siteName, row.flat.flat_number));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex items-center gap-3 p-2.5">
      <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-[10px] text-slate-400">
          {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : done ? "…" : "—"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {row.flat.flat_number}
            {row.flat.consumer_name ? (
              <span className="ml-2 text-sm font-normal text-slate-500">{row.flat.consumer_name}</span>
            ) : null}
          </p>
          <p className="truncate text-xs text-slate-500">
            {done && row.record
              ? `Reading ${row.record.meter_reading ?? "—"} · ${row.record.meter_make ?? "—"}`
              : `BP ${row.flat.bp_number ?? "—"} · pending`}
          </p>
        </div>
      </button>
      {done ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 active:bg-brand-100"
          >
            View
          </button>
          <button
            onClick={pdf}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 active:bg-slate-200 disabled:opacity-40"
          >
            {busy ? "…" : "PDF"}
          </button>
        </div>
      ) : (
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Pending
        </span>
      )}

      {open ? <MeterViewer siteName={siteName} row={row} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function MeterViewer({
  siteName,
  row,
  onClose,
}: {
  siteName: string;
  row: MeterFlatRow;
  onClose: () => void;
}) {
  const rec = row.record;
  const [meter, setMeter] = useState<string | null>(null);
  const [valve, setValve] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([meterPhotoUrl(rec?.meter_photo_path ?? null), meterPhotoUrl(rec?.valve_photo_path ?? null)]).then(
      ([m, v]) => {
        if (cancelled) return;
        setMeter(m);
        setValve(v);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rec?.meter_photo_path, rec?.valve_photo_path]);

  const pdf = async () => {
    if (!rec) return;
    setBusy(true);
    try {
      const doc = await buildFlatPdf(siteName, row.flat, rec);
      await sharePdf(doc, pdfFileName(siteName, row.flat.flat_number));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Flat ${row.flat.flat_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <InfoRow label="Site" value={siteName} />
          <InfoRow label="Consumer" value={row.flat.consumer_name ?? "—"} />
          <InfoRow label="BP number" value={row.flat.bp_number ?? "—"} />
          <InfoRow label="Application no." value={row.flat.application_no ?? "—"} />
          <InfoRow label="Tower / floor" value={`${row.flat.tower ?? "—"} · ${row.flat.floor ?? "—"}`} />
        </div>

        {rec ? (
          <>
            <div className="rounded-xl bg-brand-50 p-3 text-sm">
              <InfoRow label="Meter reading" value={rec.meter_reading != null ? String(rec.meter_reading) : "—"} strong />
              <InfoRow
                label="Initial meter reading"
                value={rec.initial_meter_reading != null ? String(rec.initial_meter_reading) : "—"}
              />
              <InfoRow label="Meter make" value={rec.meter_make ?? "—"} />
              <InfoRow label="Work date" value={rec.work_date} />
              {rec.remarks ? <InfoRow label="Remarks" value={rec.remarks} /> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <PhotoTile label="Meter photo" url={meter} onZoom={setZoom} />
              <PhotoTile label="Valve / regulator" url={valve} onZoom={setZoom} />
            </div>

            <Button onClick={pdf} disabled={busy} className="w-full">
              {busy ? "Building…" : "Download PDF"}
            </Button>
          </>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Not recorded yet — the supervisor hasn't added meter details for this flat.
          </p>
        )}
      </div>

      {zoom ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      ) : null}
    </Modal>
  );
}

function InfoRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? "font-bold text-slate-900" : "font-medium text-slate-800"}>{value}</span>
    </div>
  );
}

function PhotoTile({
  label,
  url,
  onZoom,
}: {
  label: string;
  url: string | null;
  onZoom: (u: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-slate-500">{label}</p>
      <button
        type="button"
        onClick={() => (url ? onZoom(url) : undefined)}
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-[11px] text-slate-400"
      >
        {url ? <img src={url} alt={label} className="h-full w-full object-cover" /> : "No photo"}
      </button>
    </div>
  );
}
