import { useCallback, useEffect, useRef, useState } from "react";
import type { CornerPoints, CornerEditor } from "scanic";
import { applyScanFilter, canvasToJpeg, type ScanFilter } from "../lib/scanFilter";

type Stage = "pick" | "detect" | "adjust" | "preview";

const FILTERS: { id: ScanFilter; label: string }[] = [
  { id: "bw", label: "Document" },
  { id: "gray", label: "Grey" },
  { id: "color", label: "Colour" },
];

export function DocumentScanner({
  title,
  onClose,
  onDone,
}: {
  title: string;
  onClose: () => void;
  onDone: (result: { blob: Blob; url: string }) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [filter, setFilter] = useState<ScanFilter>("bw");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const extractedRef = useRef<HTMLCanvasElement | null>(null);
  const filteredRef = useRef<HTMLCanvasElement | null>(null);
  const initCornersRef = useRef<CornerPoints | null>(null);
  const scanicRef = useRef<typeof import("scanic") | null>(null);

  const getScanic = useCallback(async () => {
    if (!scanicRef.current) scanicRef.current = await import("scanic");
    return scanicRef.current;
  }, []);

  const reset = () => {
    setSource(null);
    setStage("pick");
    setMessage(null);
    setError(null);
    setConfidence(null);
    extractedRef.current = null;
    filteredRef.current = null;
    initCornersRef.current = null;
  };

  /* ---------- straighten ---------- */

  const extractWith = async (canvas: HTMLCanvasElement, corners: CornerPoints) => {
    setStage("detect");
    setMessage("Straightening the page…");
    setError(null);
    try {
      const { extractDocument } = await getScanic();
      const res = await extractDocument(canvas, corners, { output: "canvas" });
      const out = res.output as HTMLCanvasElement | null;
      if (!res.success || !out) {
        setError(res.message || "Could not straighten that page.");
        setMessage(null);
        setStage("adjust");
        return;
      }
      extractedRef.current = out;
      setMessage(null);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process the page.");
      setMessage(null);
      setStage("adjust");
    }
  };

  /* ---------- detect ---------- */

  const detect = async (canvas: HTMLCanvasElement, detector: "classical" | "ml") => {
    setStage("detect");
    setMessage(detector === "ml" ? "Using the better detector…" : "Finding the page…");
    setError(null);
    try {
      const { scanDocument } = await getScanic();
      const res = await scanDocument(canvas, {
        mode: "detect",
        detector,
        maxProcessingDimension: 1600,
      });
      setConfidence(typeof res.confidence === "number" ? res.confidence : null);
      if (!res.success || !res.corners) {
        initCornersRef.current = insetQuad(canvas);
        setMessage(null);
        setError("Couldn't find the page edges — drag the corners to fit the form.");
        setStage("adjust");
        return;
      }
      initCornersRef.current = res.corners;
      await extractWith(canvas, res.corners);
    } catch (e) {
      initCornersRef.current = insetQuad(canvas);
      setConfidence(null);
      setError(e instanceof Error ? `Auto-detect failed: ${e.message}` : "Auto-detect failed.");
      setMessage(null);
      setStage("adjust");
    }
  };

  /* ---------- capture ---------- */

  const acceptFile = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    setStage("detect");
    setMessage("Preparing photo…");
    try {
      const canvas = await fileToCanvas(file, 2000);
      setSource(canvas);
      await detect(canvas, "classical");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that photo.");
      setStage("pick");
      setMessage(null);
    }
  };

  /* ---------- corner editor ---------- */

  useEffect(() => {
    if (stage !== "adjust" || !source || !editorHost.current) return;
    let cancelled = false;
    let editor: CornerEditor | null = null;
    const host = editorHost.current;

    (async () => {
      try {
        const { createCornerEditor } = await getScanic();
        if (cancelled) return;
        host.innerHTML = "";
        editor = createCornerEditor({
          container: host,
          image: source,
          corners: initCornersRef.current ?? insetQuad(source),
          magnifier: { enabled: true, zoom: 2, size: 110 },
          nudges: { enabled: true, steps: [1, 5] },
          theme: { accent: "#14b8a6" },
          onChange: (c) => {
            initCornersRef.current = c;
          },
          onCancel: () => onClose(),
          onConfirm: (c) => {
            initCornersRef.current = c;
            void extractWith(source, c);
          },
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not start the corner editor.");
        }
      }
    })();

    return () => {
      cancelled = true;
      editor?.destroy();
      host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, source]);

  /* ---------- preview ---------- */

  useEffect(() => {
    const src = extractedRef.current;
    const dst = previewRef.current;
    if (stage !== "preview" || !src || !dst) return;
    const filtered = applyScanFilter(src, filter);
    dst.width = filtered.width;
    dst.height = filtered.height;
    const ctx = dst.getContext("2d");
    if (ctx) ctx.drawImage(filtered, 0, 0);
    filteredRef.current = filtered;
  }, [stage, filter]);

  const useScan = async () => {
    const canvas = filteredRef.current ?? extractedRef.current;
    if (!canvas) return;
    setMessage("Saving scan…");
    try {
      const blob = await canvasToJpeg(canvas, 0.86);
      onDone({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the scan.");
    } finally {
      setMessage(null);
    }
  };

  const skipScan = () => {
    if (!source) return;
    extractedRef.current = source;
    setError(null);
    setFilter("color");
    setStage("preview");
  };

  const messageText = message;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="truncate text-sm font-semibold">{title}</p>
        <button
          onClick={onClose}
          className="rounded-full p-2 text-slate-300 active:bg-white/10"
          aria-label="Close scanner"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {error ? (
          <p className="mb-2 rounded-xl bg-amber-500/15 p-2.5 text-xs text-amber-200">{error}</p>
        ) : null}

        {messageText ? (
          <p className="mb-2 text-center text-sm font-medium text-slate-300">{messageText}</p>
        ) : null}

        {stage === "pick" ? (
          <div className="flex h-full min-h-[46vh] flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-white/10 p-4">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3" strokeLinecap="round" />
                <path d="M4 12h16" strokeLinecap="round" opacity="0.35" />
              </svg>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-slate-300">
              Lay the filled GAIL form on a flat surface and photograph the whole page. It will be
              straightened automatically.
            </p>
          </div>
        ) : null}

        {stage === "detect" ? (
          <div className="flex min-h-[46vh] flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-teal-400" />
            <span>Working…</span>
          </div>
        ) : null}

        {stage === "adjust" ? (
          <>
            <p className="mb-2 text-center text-xs text-slate-400">
              Drag the four corners to the edges of the form.
              {confidence != null ? ` Auto-detect ${Math.round(confidence * 100)}%.` : ""}
            </p>
            <div ref={editorHost} className="relative w-full overflow-hidden rounded-xl bg-slate-900" style={{ minHeight: 420 }} />
          </>
        ) : null}

        {stage === "preview" ? (
          <div className="flex h-full min-h-[46vh] items-center justify-center">
            <canvas ref={previewRef} className="block max-h-full w-auto max-w-full rounded-lg" />
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 px-4 pb-3 pt-3">
        {stage === "pick" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700"
            >
              Take photo
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-white/10 py-3 text-sm font-semibold text-white active:bg-white/20"
            >
              Upload
            </button>
          </div>
        ) : null}

        {stage === "adjust" ? (
          <div className="flex gap-2">
            <button
              onClick={skipScan}
              className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white active:bg-white/20"
            >
              Use photo as-is
            </button>
            <button
              onClick={() => source && detect(source, "ml")}
              className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white active:bg-white/20"
            >
              Better detection
            </button>
          </div>
        ) : null}

        {stage === "preview" ? (
          <>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-xl py-2 text-xs font-semibold ${
                    filter === f.id ? "bg-white text-slate-900" : "bg-white/10 text-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white active:bg-white/20"
              >
                Retake
              </button>
              <button
                onClick={() => setStage("adjust")}
                className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white active:bg-white/20"
              >
                Adjust
              </button>
              <button
                onClick={useScan}
                disabled={!!message}
                className="flex-[1.4] rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
              >
                Use scan
              </button>
            </div>
          </>
        ) : null}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function insetQuad(canvas: HTMLCanvasElement): CornerPoints {
  const w = canvas.width;
  const h = canvas.height;
  const dx = Math.round(w * 0.06);
  const dy = Math.round(h * 0.06);
  return {
    topLeft: { x: dx, y: dy },
    topRight: { x: w - dx, y: dy },
    bottomRight: { x: w - dx, y: h - dy },
    bottomLeft: { x: dx, y: h - dy },
  };
}

async function fileToCanvas(file: File, maxDim: number): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | null = null;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = null;
    }
  }

  const img = bitmap
    ? null
    : await new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const el = new Image();
        el.onload = () => {
          URL.revokeObjectURL(url);
          resolve(el);
        };
        el.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not read the image."));
        };
        el.src = url;
      });

  const source: CanvasImageSource = bitmap ?? img!;
  const width = bitmap ? bitmap.width : img!.naturalWidth;
  const height = bitmap ? bitmap.height : img!.naturalHeight;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image on this device.");
  ctx.drawImage(source, 0, 0, w, h);
  bitmap?.close();
  return canvas;
}
