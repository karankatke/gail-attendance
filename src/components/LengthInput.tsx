import { useEffect, useState } from "react";
import { inputClass } from "./ui";

const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function ftInToM(ft: string, inch: string): number {
  return (Number(ft) || 0) * FT_TO_M + (Number(inch) || 0) * IN_TO_M;
}

function mToFtIn(m: number): { ft: string; inch: string } {
  const totalIn = m / IN_TO_M;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round((totalIn - ft * 12) * 100) / 100;
  return { ft: String(ft), inch: String(inch) };
}

/**
 * Length input for supervisors: feet + inches (default) or metres.
 * The parent always receives metres, or null when nothing was entered.
 */
export function LengthInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (m: number | null) => void;
  hint?: string;
}) {
  const [mode, setMode] = useState<"ftin" | "m">(value != null ? "m" : "ftin");
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [meters, setMeters] = useState(value != null ? String(value) : "");

  const computed = mode === "ftin" ? round3(ftInToM(ft, inch)) : round3(Number(meters) || 0);
  const hasInput =
    mode === "ftin" ? ft.trim() !== "" || inch.trim() !== "" : meters.trim() !== "";
  const next = hasInput ? computed : null;

  useEffect(() => {
    if (next !== value) onChange(next);
  }, [next, value, onChange]);

  const switchMode = (nextMode: "ftin" | "m") => {
    if (nextMode === mode) return;
    if (nextMode === "m") {
      if (hasInput) setMeters(String(computed));
    } else if (meters.trim() !== "") {
      const { ft: f, inch: i } = mToFtIn(Number(meters) || 0);
      setFt(f);
      setInch(i);
    }
    setMode(nextMode);
  };

  return (
    <div className="rounded-xl border border-slate-200 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => switchMode("ftin")}
            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
              mode === "ftin" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            Feet &amp; inches
          </button>
          <button
            type="button"
            onClick={() => switchMode("m")}
            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
              mode === "m" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            Metres
          </button>
        </div>
      </div>

      {mode === "ftin" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-slate-500">Feet</span>
            <input
              inputMode="decimal"
              value={ft}
              onChange={(e) => setFt(e.target.value)}
              placeholder="0"
              className={`${inputClass} py-2 text-center text-lg font-semibold`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-slate-500">Inches</span>
            <input
              inputMode="decimal"
              value={inch}
              onChange={(e) => setInch(e.target.value)}
              placeholder="0"
              className={`${inputClass} py-2 text-center text-lg font-semibold`}
            />
          </label>
        </div>
      ) : (
        <label className="mt-2 block">
          <span className="mb-1 block text-[10px] font-medium text-slate-500">Metres</span>
          <input
            inputMode="decimal"
            value={meters}
            onChange={(e) => setMeters(e.target.value)}
            placeholder="0.000"
            className={`${inputClass} py-2 text-center text-lg font-semibold`}
          />
        </label>
      )}

      <p className="mt-1 text-[11px] text-slate-400">
        {hasInput ? `= ${computed.toFixed(3)} m` : hint ?? "Enter the measurement"}
      </p>
    </div>
  );
}
