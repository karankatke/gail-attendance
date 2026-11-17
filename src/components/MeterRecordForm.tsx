import { useEffect, useRef, useState } from "react";
import { Button, Field, Modal, inputClass } from "./ui";
import { DocumentScanner } from "./DocumentScanner";
import { DownloadIcon, ShareIcon } from "./icons";
import { removeRow, saveMeterRecord } from "../lib/db";
import { todayISO } from "../lib/dates";
import { buildFormPdf, buildMeterPhotoPdf, pdfFileName, sharePdf } from "../lib/pdf";
import {
  compressImage,
  isRecordComplete,
  meterPhotoUrl,
  missingMeterFields,
  shareMeterPhoto,
  uploadMeterPhoto,
} from "../lib/meters";
import { LengthInput } from "./LengthInput";
import type { MeterRecord, MeterSide, SiteFlat } from "../lib/types";

type PdfBusy = "form" | "meter" | "meter-image" | null;

async function compressPreview(file: File): Promise<{ blob: Blob; url: string }> {
  const blob = await compressImage(file);
  return { blob, url: URL.createObjectURL(blob) };
}

function PhotoField({
  label,
  preview,
  onChange,
  removeLabel = "Remove",
}: {
  label: string;
  preview: string | null;
  onChange: (v: { blob: Blob; url: string } | null) => void;
  removeLabel?: string;
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
              {removeLabel}
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

/** Shared meter record form: supervisors record, owners correct and complete. */
export function MeterRecordForm({
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
  const [reading, setReading] = useState(record?.meter_reading ?? "");
  const [initialReading, setInitialReading] = useState(
    record?.initial_meter_reading != null ? String(record.initial_meter_reading) : "",
  );
  const [make, setMake] = useState(record?.meter_make ?? "");
  const [side, setSide] = useState<MeterSide | null>(record?.meter_side ?? null);
  const [giPipe, setGiPipe] = useState<number | null>(record?.gi_pipe_length_m ?? null);
  const [mlcPipe, setMlcPipe] = useState<number | null>(record?.mlc_pipe_length_m ?? null);
  const [workDate, setWorkDate] = useState(record?.work_date ?? todayISO());
  const [remarks, setRemarks] = useState(record?.remarks ?? "");
  const [meter, setMeter] = useState<{ blob: Blob; url: string } | null>(null);
  const [valve, setValve] = useState<{ blob: Blob; url: string } | null>(null);
  const [formScan, setFormScan] = useState<{ blob: Blob; url: string } | null>(null);
  const [remoteMeter, setRemoteMeter] = useState<string | null>(null);
  const [remoteValve, setRemoteValve] = useState<string | null>(null);
  const [remoteForm, setRemoteForm] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [removed, setRemoved] = useState({ meter: false, valve: false, form: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState<MeterRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<PdfBusy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      meterPhotoUrl(record?.meter_photo_path ?? null),
      meterPhotoUrl(record?.valve_photo_path ?? null),
      meterPhotoUrl(record?.form_photo_path ?? null),
    ]).then(([m, v, f]) => {
      if (cancelled) return;
      setRemoteMeter(m);
      setRemoteValve(v);
      setRemoteForm(f);
    });
    return () => {
      cancelled = true;
    };
  }, [record?.meter_photo_path, record?.valve_photo_path, record?.form_photo_path]);

  const hasMeter = !removed.meter && (!!meter || (!!remoteMeter && !!record?.meter_photo_path));
  const hasValve = !removed.valve && (!!valve || (!!remoteValve && !!record?.valve_photo_path));
  const hasForm = !removed.form && (!!formScan || (!!remoteForm && !!record?.form_photo_path));

  const changePhoto = (
    kind: "meter" | "valve",
    next: { blob: Blob; url: string } | null,
  ) => {
    const current = kind === "meter" ? meter : valve;
    if (kind === "meter") setMeter(next);
    else setValve(next);
    if (next) {
      setRemoved((r) => ({ ...r, [kind]: false }));
      return;
    }
    if (!current) setRemoved((r) => ({ ...r, [kind]: true }));
  };

  const clearForm = () => {
    if (formScan) {
      setFormScan(null);
      return;
    }
    setRemoteForm(null);
    setRemoved((r) => ({ ...r, form: true }));
  };

  const save = async () => {
    const readingValue = reading.trim() || null;
    const initialText = initialReading.trim().replace(",", ".");
    const initialNum = initialText === "" ? null : Number(initialText);
    if (initialText !== "" && !Number.isFinite(initialNum)) {
      setError("Initial meter reading must be a number.");
      return;
    }
    if (giPipe === 0 || mlcPipe === 0) {
      setError("GI and MLC piping must be more than 0, or left blank until measured.");
      return;
    }
    const hasAny =
      readingValue != null ||
      initialNum != null ||
      make.trim() !== "" ||
      side != null ||
      giPipe != null ||
      mlcPipe != null ||
      hasMeter ||
      hasValve ||
      hasForm ||
      !!record;
    if (!hasAny) {
      setError("Add at least one detail before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const meterPath = removed.meter
        ? null
        : meter
          ? await uploadMeterPhoto(flat.location_id, flat.id, "meter", meter.blob)
          : record?.meter_photo_path ?? null;
      const valvePath = removed.valve
        ? null
        : valve
          ? await uploadMeterPhoto(flat.location_id, flat.id, "valve", valve.blob)
          : record?.valve_photo_path ?? null;
      const formPath = removed.form
        ? null
        : formScan
          ? await uploadMeterPhoto(flat.location_id, flat.id, "form", formScan.blob)
          : record?.form_photo_path ?? null;

      const complete =
        readingValue != null &&
        initialNum != null &&
        make.trim() !== "" &&
        side != null &&
        giPipe != null &&
        giPipe > 0 &&
        mlcPipe != null &&
        mlcPipe > 0 &&
        !!meterPath &&
        !!valvePath &&
        !!formPath;

      const row = await saveMeterRecord({
        site_flat_id: flat.id,
        location_id: flat.location_id,
        meter_reading: readingValue,
        initial_meter_reading: initialNum,
        meter_make: make.trim() || null,
        meter_side: side,
        gi_pipe_length_m: giPipe,
        mlc_pipe_length_m: mlcPipe,
        work_date: workDate,
        remarks: remarks.trim() || null,
        meter_photo_path: meterPath,
        valve_photo_path: valvePath,
        form_photo_path: formPath,
        status: complete ? "done" : "draft",
        created_by_profile_id: record?.created_by_profile_id ?? profileId,
        updated_by_profile_id: profileId,
      });
      if (row) {
        setSaved(row);
        setBusy(false);
      } else {
        onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const downloadForm = async () => {
    const rec = saved ?? record;
    if (!rec) return;
    setPdfBusy("form");
    setError(null);
    try {
      const doc = await buildFormPdf(siteName, flat, rec);
      await sharePdf(doc, pdfFileName(siteName, flat.flat_number, "form"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the PDF");
    } finally {
      setPdfBusy(null);
    }
  };

  const downloadMeterPdf = async () => {
    const rec = saved ?? record;
    if (!rec) return;
    setPdfBusy("meter");
    setError(null);
    try {
      const doc = await buildMeterPhotoPdf(siteName, flat, rec);
      await sharePdf(doc, pdfFileName(siteName, flat.flat_number, "meter"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the meter PDF");
    } finally {
      setPdfBusy(null);
    }
  };

  const downloadMeterImage = async (path: string) => {
    setPdfBusy("meter-image");
    setError(null);
    try {
      const slug = siteName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
      const res = await shareMeterPhoto(path, `${slug}-${flat.flat_number}-meter-${todayISO()}`);
      if (res === "downloaded") setError("Meter photo saved to your device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the meter photo");
    } finally {
      setPdfBusy(null);
    }
  };

  const del = async () => {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      await removeRow("meter_records", record.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  if (saved) {
    const savedComplete = isRecordComplete(saved);
    const savedMissing = missingMeterFields(saved);
    return (
      <Modal title={`Flat ${flat.flat_number}`} onClose={onSaved}>
        <div className="space-y-4">
          <div
            className={`rounded-xl p-4 text-center ${
              savedComplete ? "bg-emerald-50" : "bg-amber-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                savedComplete ? "text-emerald-800" : "text-amber-800"
              }`}
            >
              {savedComplete ? "Meter details complete" : "Saved — some details are pending"}
            </p>
            <p
              className={`mt-0.5 text-xs ${
                savedComplete ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {savedComplete
                ? "Download the meter photo PDF or GAIL form PDF for upload."
                : `Still needed: ${savedMissing.join(", ")}`}
            </p>
          </div>
          {!savedComplete ? (
            <Button variant="secondary" onClick={() => setSaved(null)} className="w-full">
              Add the missing details
            </Button>
          ) : null}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              For GAIL upload
            </p>
            {saved.meter_photo_path ? (
              <Button
                variant="secondary"
                onClick={downloadMeterPdf}
                disabled={!!pdfBusy}
                className="w-full"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <DownloadIcon />
                  {pdfBusy === "meter" ? "Building…" : "Download meter photo PDF"}
                </span>
              </Button>
            ) : null}
            {saved.form_photo_path ? (
              <Button
                variant="secondary"
                onClick={downloadForm}
                disabled={!!pdfBusy}
                className="w-full"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <DownloadIcon />
                  {pdfBusy === "form" ? "Building…" : "Download GAIL form PDF"}
                </span>
              </Button>
            ) : null}
            {saved.meter_photo_path ? (
              <Button
                variant="ghost"
                onClick={() => downloadMeterImage(saved.meter_photo_path!)}
                disabled={!!pdfBusy}
                className="w-full text-xs"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <ShareIcon />
                  {pdfBusy === "meter-image" ? "Preparing…" : "Share meter photo"}
                </span>
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <Button onClick={onSaved} className="w-full">
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  const draftMissing = missingMeterFields({
    meter_reading: reading.trim() || null,
    initial_meter_reading: initialReading.trim() === "" ? null : Number(initialReading),
    meter_make: make.trim() || null,
    meter_side: side,
    gi_pipe_length_m: giPipe,
    mlc_pipe_length_m: mlcPipe,
    meter_photo_path: hasMeter ? "set" : null,
    valve_photo_path: hasValve ? "set" : null,
    form_photo_path: hasForm ? "set" : null,
  });

  return (
    <Modal title={`Flat ${flat.flat_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <Row label="Consumer" value={flat.consumer_name ?? "—"} />
          <Row label="BP number" value={flat.bp_number ?? "—"} />
          <Row label="Application no." value={flat.application_no ?? "—"} />
          <Row label="Tower / floor" value={`${flat.tower ?? "—"} · ${flat.floor ?? "—"}`} />
        </div>

        {draftMissing.length > 0 ? (
          <div className="rounded-xl bg-amber-50 p-2.5">
            <p className="text-[11px] font-semibold text-amber-800">Still needed to complete</p>
            <p className="text-[11px] text-amber-700">{draftMissing.join(" · ")}</p>
          </div>
        ) : (
          <p className="rounded-xl bg-emerald-50 p-2.5 text-[11px] font-semibold text-emerald-700">
            All details complete
          </p>
        )}

        <Field label="Meter number">
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            className={inputClass}
            placeholder="e.g. 18002411A"
          />
        </Field>
        <p className="-mt-2 text-[11px] text-slate-400">
          Use exactly what is printed on the meter — letters and numbers are both fine.
        </p>
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
          <input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className={inputClass}
            placeholder="e.g. Itron / Elster"
          />
        </Field>
        <Field label="Meter side">
          <div className="grid grid-cols-2 gap-2">
            {(["LHS", "RHS"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  side === s
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Work date">
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total piping for this flat
          </p>
          <p className="-mt-1 text-[11px] text-slate-400">
            Enter in feet/inches or metres. It is stored in metres.
          </p>
          <LengthInput label="GI piping" value={giPipe} onChange={setGiPipe} />
          <LengthInput label="MLC piping" value={mlcPipe} onChange={setMlcPipe} />
          {giPipe != null && mlcPipe != null ? (
            <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              Total piping: <b>{(giPipe + mlcPipe).toFixed(2)} m</b> (GI + MLC)
            </p>
          ) : null}
        </div>

        <div>
          <PhotoField
            label="Meter photo"
            preview={meter?.url ?? (removed.meter ? null : remoteMeter)}
            onChange={(v) => changePhoto("meter", v)}
            removeLabel={
              meter ? (remoteMeter ? "Cancel new photo" : "Remove photo") : "Remove saved photo"
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Make sure the meter number and meter make are clearly visible.
          </p>
          {meter && remoteMeter ? (
            <p className="mt-1 text-[11px] font-medium text-brand-700">
              New photo selected — save to replace the saved photo, or cancel the new one.
            </p>
          ) : null}
        </div>
        <PhotoField
          label="Stove photo (on)"
          preview={valve?.url ?? (removed.valve ? null : remoteValve)}
          onChange={(v) => changePhoto("valve", v)}
          removeLabel={
            valve ? (remoteValve ? "Cancel new photo" : "Remove photo") : "Remove saved photo"
          }
        />

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-600">GAIL form (scan)</p>
              <p className="text-[11px] text-slate-400">
                Photograph the filled & signed form; it will be straightened and cleaned up.
              </p>
            </div>
            {hasForm ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Added
              </span>
            ) : (
              <span className="shrink-0 text-[11px] font-semibold text-amber-600">Required</span>
            )}
          </div>

          {formScan?.url ?? (removed.form ? null : remoteForm) ? (
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="mt-2 block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              <img
                src={formScan?.url ?? (removed.form ? "" : remoteForm) ?? ""}
                alt="GAIL form"
                className="max-h-56 w-full object-contain"
              />
            </button>
          ) : null}

          <div className="mt-2 flex gap-2">
            <Button
              variant={hasForm ? "secondary" : "primary"}
              onClick={() => setScanOpen(true)}
              className="flex-1 text-xs"
            >
              {hasForm ? "Rescan form" : "Scan form"}
            </Button>
            {hasForm ? (
              <Button variant="ghost" onClick={clearForm} className="text-xs">
                {formScan
                  ? remoteForm
                    ? "Cancel new scan"
                    : "Remove scan"
                  : "Remove saved scan"}
              </Button>
            ) : null}
          </div>
        </div>

        <Field label="Remarks (optional)">
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className={inputClass}
            placeholder="e.g. regulator replaced"
          />
        </Field>

        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <Button onClick={save} disabled={busy} className="w-full py-4 text-base shadow-md">
          {busy ? "Saving…" : record ? "Save changes" : "Save meter details"}
        </Button>

        {record ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              For GAIL upload
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={downloadMeterPdf}
                disabled={!!pdfBusy || !record.meter_photo_path}
                className="text-xs"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <DownloadIcon />
                  {pdfBusy === "meter" ? "Building…" : "Meter photo PDF"}
                </span>
              </Button>
              <Button
                variant="secondary"
                onClick={downloadForm}
                disabled={!!pdfBusy || !record.form_photo_path}
                className="text-xs"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <DownloadIcon />
                  {pdfBusy === "form" ? "Building…" : "GAIL form PDF"}
                </span>
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={() => record.meter_photo_path && downloadMeterImage(record.meter_photo_path)}
              disabled={!!pdfBusy || !record.meter_photo_path}
              className="w-full text-xs"
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <ShareIcon />
                {pdfBusy === "meter-image" ? "Preparing…" : "Share meter photo"}
              </span>
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy} className="w-full">
              Delete record
            </Button>
          </div>
        ) : null}
      </div>

      {scanOpen ? (
        <DocumentScanner
          title={`Scan GAIL form · ${flat.flat_number}`}
          onClose={() => setScanOpen(false)}
          onDone={({ blob, url }) => {
            setFormScan({ blob, url });
            setRemoved((r) => ({ ...r, form: false }));
            setScanOpen(false);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <Modal
          title="Delete meter record?"
          onClose={() => {
            if (!busy) setConfirmDelete(false);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">
                Everything recorded for Flat {flat.flat_number} will be deleted.
              </p>
              <p className="mt-1 text-xs">
                Meter number, readings, piping, photos, GAIL form and remarks. This cannot be
                undone.
              </p>
            </div>
            {error ? (
              <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}
            <Button variant="danger" onClick={del} disabled={busy} className="w-full py-3">
              {busy ? "Deleting…" : "Yes, delete the whole record"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </Modal>
      ) : null}
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
