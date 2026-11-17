import { useEffect, useRef } from "react";

type BackLayer = { onBack: () => void };

let layers: BackLayer[] = [];
let installed = false;
let exiting = false;

function handlePop() {
  if (exiting) return;

  if (layers.length > 0) {
    const top = layers[layers.length - 1];
    layers = layers.slice(0, -1);
    top.onBack();
    // Keep one trap entry so the next back press is still handled in-app.
    window.history.pushState({ gailGuard: true }, "");
    return;
  }

  // Nothing internal is open: continue to the previous page (e.g. the Works app).
  exiting = true;
  window.setTimeout(() => {
    exiting = false;
  }, 800);
  window.history.back();
}

/** Call once when the app starts. Keeps one history entry for back handling. */
export function installBackGuard() {
  if (installed) return;
  installed = true;
  if (!window.history.state?.gailGuard) {
    window.history.pushState({ gailGuard: true }, "");
  }
  window.addEventListener("popstate", handlePop);
}

/** Register a screen/modal that the hardware or browser back button should close. */
export function registerBackLayer(onBack: () => void): () => void {
  const layer: BackLayer = { onBack };
  layers.push(layer);
  return () => {
    layers = layers.filter((l) => l !== layer);
  };
}

/**
 * Close the current screen/modal on back instead of leaving the app.
 * Layers close top-down: modal -> flat/site -> tab.
 */
export function useBackLayer(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;

  useEffect(() => {
    if (!active) return;
    return registerBackLayer(() => ref.current());
  }, [active]);
}
