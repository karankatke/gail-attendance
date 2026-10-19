import type { jsPDF } from "jspdf";
import { meterPhotoUrl } from "./meters";
import { prettyDate, todayISO } from "./dates";
import type { MeterRecord, SiteFlat } from "./types";

const M = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - M * 2;

interface Img {
  data: string;
  width: number;
  height: number;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read image"));
    r.readAsDataURL(blob);
  });
}

async function loadImage(path: string | null): Promise<Img | null> {
  const url = await meterPhotoUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await blobToDataUrl(await res.blob());
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("bad image"));
      img.src = data;
    });
    if (!dims.w || !dims.h) return null;
    return { data, width: dims.w, height: dims.h };
  } catch {
    return null;
  }
}

/** Draw an image fitted into a box; returns the drawn height. */
function drawFitted(
  doc: jsPDF,
  img: Img,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): number {
  const ratio = img.height / img.width;
  let w = maxW;
  let h = w * ratio;
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  doc.addImage(img.data, "JPEG", x, y, w, h);
  return h;
}

function drawFittedCentered(
  doc: jsPDF,
  img: Img,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): number {
  const ratio = img.height / img.width;
  let w = maxW;
  let h = w * ratio;
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  doc.addImage(img.data, "JPEG", x + (maxW - w) / 2, y, w, h);
  return h;
}

function placeholder(doc: jsPDF, x: number, y: number, w: number, h: number, label: string) {  doc.setDrawColor(200);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
  doc.setTextColor(150);
  doc.setFontSize(9);
  doc.text(label, x + w / 2, y + h / 2, { align: "center" });
}

function fieldRows(siteName: string, flat: SiteFlat, rec: MeterRecord): [string, string][] {
  const rows: [string, string][] = [
    ["Site", siteName],
    ["Tower", flat.tower ?? "—"],
    ["Flat number", flat.flat_number],
    ["Floor", flat.floor != null ? String(flat.floor) : "—"],
    ["Consumer name", flat.consumer_name ?? "—"],
    ["BP number", flat.bp_number ?? "—"],
    ["Application no.", flat.application_no ?? "—"],
    ["Meter number", rec.meter_reading != null ? String(rec.meter_reading) : "—"],
    ["Initial meter reading", rec.initial_meter_reading != null ? String(rec.initial_meter_reading) : "—"],
    ["Meter make", rec.meter_make ?? "—"],
    ["Work date", prettyDate(rec.work_date)],
  ];
  if (rec.remarks && rec.remarks.trim()) rows.push(["Remarks", rec.remarks.trim()]);
  return rows;
}

function renderFlatPage(
  doc: jsPDF,
  siteName: string,
  flat: SiteFlat,
  rec: MeterRecord,
  meterImg: Img | null,
  valveImg: Img | null,
) {
  // Header
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(siteName.toUpperCase(), M, M);
  doc.setFontSize(17);
  doc.setTextColor(17);
  doc.text(`Flat ${flat.flat_number}`, M, M + 7);
  doc.setFontSize(11);
  doc.setTextColor(95);
  doc.text("Gas Meter Conversion Record", M, M + 13);
  doc.setDrawColor(215);
  doc.line(M, M + 16, PAGE_W - M, M + 16);

  // Fields
  let y = M + 24;
  doc.setFontSize(10);
  const labelX = M;
  const valueX = 78;
  for (const [label, value] of fieldRows(siteName, flat, rec)) {
    doc.setTextColor(120);
    doc.text(label, labelX, y);
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(value, PAGE_W - M - valueX);
    doc.text(lines[0] ?? "", valueX, y);
    y += 6.5;
  }

  // Photos
  y += 3;
  const gap = 6;
  const boxW = (CONTENT_W - gap) / 2;
  const boxH = 74;
  const meterX = M;
  const valveX = M + boxW + gap;

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text("Meter photo", meterX, y);
  doc.text("Valve / regulator (on)", valveX, y);
  const imgY = y + 3;

  if (meterImg) drawFitted(doc, meterImg, meterX, imgY, boxW, boxH);
  else placeholder(doc, meterX, imgY, boxW, boxH, "No photo");

  if (valveImg) drawFitted(doc, valveImg, valveX, imgY, boxW, boxH);
  else placeholder(doc, valveX, imgY, boxW, boxH, "No photo");

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Generated ${prettyDate(todayISO())} · Attendance Register`,
    M,
    297 - 8,
  );
}

function renderFormPage(
  doc: jsPDF,
  siteName: string,
  flat: SiteFlat,
  rec: MeterRecord,
  formImg: Img | null,
) {
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(siteName.toUpperCase(), M, M);
  doc.setFontSize(15);
  doc.setTextColor(17);
  doc.text(`Flat ${flat.flat_number} — GAIL form`, M, M + 7);
  doc.setFontSize(10);
  doc.setTextColor(95);
  doc.text(`Meter no. ${rec.meter_reading ?? "—"} · ${prettyDate(rec.work_date)}`, M, M + 13);
  doc.setDrawColor(215);
  doc.line(M, M + 16, PAGE_W - M, M + 16);

  const top = M + 22;
  const maxH = 297 - top - 14;
  if (formImg) drawFittedCentered(doc, formImg, M, top, CONTENT_W, maxH);
  else placeholder(doc, M, top, CONTENT_W, maxH, "No form scan");

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated ${prettyDate(todayISO())} · Attendance Register`, M, 297 - 8);
}

export async function buildFlatPdf(siteName: string, flat: SiteFlat, rec: MeterRecord): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import("jspdf");
  const [meterImg, valveImg, formImg] = await Promise.all([
    loadImage(rec.meter_photo_path),
    loadImage(rec.valve_photo_path),
    loadImage(rec.form_photo_path),
  ]);
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  renderFlatPage(doc, siteName, flat, rec, meterImg, valveImg);
  if (formImg) {
    doc.addPage();
    renderFormPage(doc, siteName, flat, rec, formImg);
  }
  return doc;
}

export async function buildSitePdf(
  siteName: string,
  items: { flat: SiteFlat; record: MeterRecord }[],
  onProgress?: (done: number, total: number) => void,
): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ unit: "mm", format: "a4" });

  // Cover
  doc.setFontSize(20);
  doc.setTextColor(17);
  doc.text(siteName, M, 40);
  doc.setFontSize(13);
  doc.setTextColor(90);
  doc.text("Gas Meter Conversion Records", M, 50);
  doc.setDrawColor(215);
  doc.line(M, 54, PAGE_W - M, 54);
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(`Flats recorded: ${items.length}`, M, 66);
  doc.text(`Generated: ${prettyDate(todayISO())}`, M, 74);

  let done = 0;
  for (const { flat, record } of items) {
    const [meterImg, valveImg, formImg] = await Promise.all([
      loadImage(record.meter_photo_path),
      loadImage(record.valve_photo_path),
      loadImage(record.form_photo_path),
    ]);
    doc.addPage();
    renderFlatPage(doc, siteName, flat, record, meterImg, valveImg);
    if (formImg) {
      doc.addPage();
      renderFormPage(doc, siteName, flat, record, formImg);
    }
    done += 1;
    onProgress?.(done, items.length);
  }
  return doc;
}

export function pdfFileName(siteName: string, flatNumber?: string): string {
  const slug = siteName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const stamp = todayISO();
  return flatNumber ? `${slug}-${flatNumber}-meter.pdf` : `${slug}-meters-${stamp}.pdf`;
}

/** Share via the native sheet when possible, otherwise download. */
export async function sharePdf(doc: jsPDF, filename: string): Promise<"shared" | "downloaded"> {
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return "shared";
    } catch {
      // user cancelled or share failed — fall back to download
    }
  }
  doc.save(filename);
  return "downloaded";
}
