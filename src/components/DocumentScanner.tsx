import { useCallback, useEffect, useRef, useState } from "react";
import type { CornerPoints, CornerEditor } from "scanic";
import { Button, Modal } from "./ui";
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

  /* ---------- capture ---------- */

  const acceptFile = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    setMessage("Preparing photo…");
    setStage("detect");
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
      initCornersRef.current = res.corners ?? insetQuad(canvas);
      if (!res.success) {
        setError("Couldn't find the page edges — drag the corners to fit the form.");
      }
      setMessage(null);
      setStage("adjust");
    } catch (e) {
      initCornersRef.current = insetQuad(canvas);
      setConfidence(null);
      setError(e instanceof Error ? `Auto-detect failed: ${e.message}` : "Auto-detect failed.");
      setMessage(null);
      setStage("adjust");
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
          theme: { accent: "#0f766e" },
          onChange: (c) => {
            initCornersRef.current = c;
          },
          onCancel: () => onClose(),
          onConfirm: (c) => {
            initCornersRef.current = c;
            void extract(c);
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

  const extract = async (corners: CornerPoints) => {
    if (!source) return;
    setStage("detect");
    setMessage("Straightening the page…");
    setError(null);
    try {
      const { extractDocument } = await getScanic();
      const res = await extractDocument(source, corners, { output: "canvas" });
      const out = res.output as HTMLCanvasElement | null;
      if (!res.success || !out) {
        setError(res.message || "Could not straighten that page.");
        setStage("adjust");
        return;
      }
      extractedRef.current = out;
      setMessage(null);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process the page.");
      setStage("adjust");
    }
  };

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
    setFilter("color");
    setStage("preview");
  };

  const busy = stage === "detect";

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {error ? <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">{error}</p> : null}
        {message ? <p className="text-center text-sm font-medium text-slate-500">{message}</p> : null}

        {stage === "pick" || (stage === "detect" && !source) ? (
          <>
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              Lay the filled GAIL form on a flat surface and photograph the whole page. You can
              adjust the corners next, and the app will straighten it and make the text crisp.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => cameraRef.current?.click()} disabled={busy}>
                Take photo
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                Upload
              </Button>
            </div>
          </>
        ) : null}

        {stage === "detect" && source ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
            <span>Working…</span>
          </div>
        ) : null}

        {stage === "adjust" ? (
          <>
            <p className="text-xs text-slate-500">
              Drag the four corners to the edges of the form.
              {confidence != null ? ` Auto-detect ${Math.round(confidence * 100)}%.` : ""}
            </p>
            <div
              ref={editorHost}
              className="relative w-full overflow-hidden rounded-xl bg-slate-900"
              style={{ minHeight: 340 }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => source && detect(source, "ml")} className="flex-1 text-xs">
                Better detection
              </Button>
              <Button variant="ghost" onClick={skipScan} className="flex-1 text-xs">
                Use photo as-is
              </Button>
            </div>
            <p className="text-center text-[11px] text-slate-400">
              "Better detection" downloads a small extra model the first time.
            </p>
          </>
        ) : null}

        {stage === "preview" ? (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <canvas ref={previewRef} className="block h-auto w-full" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-xl py-2 text-xs font-semibold ${
                    filter === f.id ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStage("adjust")} className="flex-1">
                Corners
              </Button>
              <Button onClick={useScan} disabled={!!message} className="flex-1">
                Use this scan
              </Button>
            </div>
          </>
        ) : null}

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
    </Modal>
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
