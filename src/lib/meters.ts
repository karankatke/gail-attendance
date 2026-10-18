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
  return (
    !!rec &&
    rec.meter_reading != null &&
    !!rec.meter_make?.trim() &&
    !!rec.meter_photo_path &&
    !!rec.valve_photo_path
  );
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
