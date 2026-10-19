export type ScanFilter = "color" | "gray" | "bw";

/**
 * Apply a scanner-style filter to a perspective-corrected document image.
 * Returns a new canvas (the source is left untouched).
 */
export function applyScanFilter(source: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(source, 0, 0);

  if (filter === "color") {
    ctx.putImageData(tone(ctx.getImageData(0, 0, out.width, out.height), 1.12, 4), 0, 0);
    return out;
  }

  const img = ctx.getImageData(0, 0, out.width, out.height);
  toGrayInPlace(img);
  if (filter === "gray") {
    ctx.putImageData(tone(img, 1.28, 6), 0, 0);
    return out;
  }

  adaptiveThreshold(img, out.width, out.height);
  ctx.putImageData(img, 0, 0);
  return out;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode the scan."))),
      "image/jpeg",
      quality,
    );
  });
}

function tone(img: ImageData, contrast: number, brightness: number): ImageData {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp((d[i] - 128) * contrast + 128 + brightness);
    d[i + 1] = clamp((d[i + 1] - 128) * contrast + 128 + brightness);
    d[i + 2] = clamp((d[i + 2] - 128) * contrast + 128 + brightness);
  }
  return img;
}

function toGrayInPlace(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
  }
}

/**
 * Local-mean adaptive threshold (integral image). Keeps text and handwriting
 * dark while turning the paper white, which is what makes a phone photo look
 * like a scan.
 */
function adaptiveThreshold(img: ImageData, width: number, height: number) {
  const d = img.data;
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const rowBase = (y + 1) * stride;
    const prevBase = y * stride;
    for (let x = 0; x < width; x++) {
      rowSum += d[(y * width + x) * 4];
      integral[rowBase + x + 1] = integral[prevBase + x + 1] + rowSum;
    }
  }

  const radius = Math.max(7, Math.round(Math.min(width, height) / 28));
  const bias = 9;

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    const y0i = y0 * stride;
    const y1i = (y1 + 1) * stride;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[y1i + x1 + 1] - integral[y0i + x1 + 1] - integral[y1i + x0] + integral[y0i + x0];
      const mean = sum / count;
      const idx = (y * width + x) * 4;
      const v = d[idx] < mean - bias ? 0 : 255;
      d[idx] = v;
      d[idx + 1] = v;
      d[idx + 2] = v;
    }
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
