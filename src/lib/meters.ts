import { requireClient } from "./supabase";
import type { MeterPhotoKind, MeterRecord, SiteFlat } from "./types";

export const METER_BUCKET = "meter-photos";

/** Storage path for a flat photo: {locationId}/{siteFlatId}/{meter|valve}.jpg */
export function meterPhotoPath(locationId: string, siteFlatId: string, kind: MeterPhotoKind): string {
  return `${locationId}/${siteFlatId}/${kind}.jpg`;
}

/**
 * Downscale + re-encode a phone photo before upload.
 * Keeps storage small and PDFs light. Falls back gracefully if the
 * browser can't decode via createImageBitmap.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.75): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image on this device.");
  ctx.drawImage(bitmap.source, 0, 0, width, height);
  bitmap.release();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not compress the image.");
  return blob;
}

interface LoadedBitmap {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function loadBitmap(file: File): Promise<LoadedBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read the image."));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function uploadMeterPhoto(
  locationId: string,
  siteFlatId: string,
  kind: MeterPhotoKind,
  blob: Blob,
): Promise<string> {
  const client = requireClient();
  const path = meterPhotoPath(locationId, siteFlatId, kind);
  const { error } = await client.storage
    .from(METER_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

const signedCache = new Map<string, { url: string; expires: number }>();

/** Signed URL for a private photo (cached until shortly before expiry). */
export async function meterPhotoUrl(path: string | null, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const hit = signedCache.get(path);
  if (hit && hit.expires > now) return hit.url;
  const client = requireClient();
  const { data, error } = await client.storage.from(METER_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  signedCache.set(path, { url: data.signedUrl, expires: now + (expiresIn - 60) * 1000 });
  return data.signedUrl;
}

/** True when every field GAIL needs is present. */
export function isRecordComplete(rec: MeterRecord | null): boolean {
  return missingMeterFields(rec).length === 0;
}

/** Human labels for whatever is still missing on a full or partial record. */
export function missingMeterFields(rec: Partial<MeterRecord> | null): string[] {
  if (!rec) return ["Not started"];
  const out: string[] = [];
  if (!rec.meter_reading?.trim()) out.push("Meter number");
  if (rec.initial_meter_reading == null) out.push("Initial reading");
  if (!rec.meter_make?.trim()) out.push("Meter make");
  if (!rec.meter_side) out.push("LHS/RHS");
  if (rec.gi_pipe_length_m == null || rec.gi_pipe_length_m <= 0) out.push("GI piping");
  if (rec.mlc_pipe_length_m == null || rec.mlc_pipe_length_m <= 0) out.push("MLC piping");
  if (!rec.meter_photo_path) out.push("Meter photo");
  if (!rec.valve_photo_path) out.push("Stove photo");
  if (!rec.form_photo_path) out.push("GAIL form");
  return out;
}

export function formatMeters(m: number | null): string {
  if (m == null) return "—";
  return `${m.toFixed(2)} m`;
}

/** GI + MLC total piping in metres, or null while either is missing. */
export function totalPiping(rec: Partial<MeterRecord> | null): number | null {
  if (!rec || rec.gi_pipe_length_m == null || rec.mlc_pipe_length_m == null) return null;
  return rec.gi_pipe_length_m + rec.mlc_pipe_length_m;
}

/** One-line piping summary for owners: GI + MLC = total. */
export function formatPiping(rec: Partial<MeterRecord> | null): string {
  if (!rec || rec.gi_pipe_length_m == null || rec.mlc_pipe_length_m == null) {
    return "Piping pending";
  }
  return `${rec.gi_pipe_length_m.toFixed(2)} m GI + ${rec.mlc_pipe_length_m.toFixed(
    2,
  )} m MLC = ${(rec.gi_pipe_length_m + rec.mlc_pipe_length_m).toFixed(2)} m`;
}

/** Download or share the original meter photo as an image (not a PDF). */
export async function shareMeterPhoto(
  path: string | null,
  baseName: string,
): Promise<"shared" | "downloaded"> {
  if (!path) throw new Error("No meter photo");
  const url = await meterPhotoUrl(path);
  if (!url) throw new Error("Could not load the meter photo.");
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load the meter photo.");
    blob = await res.blob();
  } catch {
    // If fetch is blocked, open the image so it can still be saved/shared.
    window.open(url, "_blank");
    return "downloaded";
  }
  const type = blob.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const file = new File([blob], `${baseName}.${ext}`, { type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch {
      // fall through to download
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "downloaded";
}

export function flatSort(a: SiteFlat, b: SiteFlat): number {
  const ta = a.tower ?? "";
  const tb = b.tower ?? "";
  if (ta !== tb) return ta.localeCompare(tb);
  const fa = a.floor ?? 0;
  const fb = b.floor ?? 0;
  if (fa !== fb) return fa - fb;
  return a.flat_number.localeCompare(b.flat_number);
}
