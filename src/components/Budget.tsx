import { useMemo, useState } from "react";
import { Card, Spinner } from "./ui";
import { formatINR } from "../lib/pay";
import { parseISO, prettyRange } from "../lib/dates";

export interface BudgetWeek {
  from: string;
  to: string;
  label: string;
  workerDays: number;
  wages: number;
  bata: number;
  lunch: number;
  travel: number;
  material: number;
  other: number;
  current: boolean;
  partial: boolean;
}

const COLORS = {
  wages: "bg-brand-600",
  lunch: "bg-amber-400",
  travel: "bg-sky-400",
  material: "bg-violet-400",
  other: "bg-slate-300",
};

export function BudgetSection({
  weeks,
  loading,
  plannedWorkerDays,
  onPlannedChange,
  baselineWagePerDay,
  baselineBataPerDay,
  baselineWeekCount,
}: {
  weeks: BudgetWeek[];
  loading: boolean;
  plannedWorkerDays: number;
  onPlannedChange: (n: number) => void;
  baselineWagePerDay: number;
  baselineBataPerDay: number;
  baselineWeekCount: number;
}) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"total" | "perDay">("total");
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);

  const planWages = plannedWorkerDays * baselineWagePerDay;
  const planBata = plannedWorkerDays * baselineBataPerDay;
  const planTotal = planWages + planBata;
  const current = weeks.find((w) => w.current) ?? weeks[weeks.length - 1] ?? null;
  const selected = weeks.find((w) => w.from === selectedFrom) ?? current;

  const scale = (w: BudgetWeek) =>
    mode === "perDay" ? (w.workerDays > 0 ? (w.wages + w.bata) / w.workerDays : 0) : w.wages + w.bata;

  const max = useMemo(() => {
    const values = weeks.map(scale);
    const plan = mode === "perDay" ? baselineWagePerDay + baselineBataPerDay : planTotal;
    return Math.max(1, ...values, plan);
  }, [weeks, mode, baselineWagePerDay, baselineBataPerDay, planTotal]);

  const planLine = mode === "perDay" ? baselineWagePerDay + baselineBataPerDay : planTotal;

  return (
    <Card className="p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">Budget &amp; trend</p>
          <p className="text-[11px] text-slate-400">
            {loading
              ? "Loading weeks…"
              : baselineWeekCount > 0
                ? `Provisional baseline · ${baselineWeekCount} complete week${baselineWeekCount === 1 ? "" : "s"}`
                : "Not enough complete weeks yet"}
          </p>
        </div>
        <span className="text-xs text-slate-400">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          {loading ? (
            <Spinner />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-400">This week · wages so far</p>
                  <p className="text-lg font-bold text-slate-900">{formatINR(current?.wages ?? 0)}</p>
                  <p className="text-[10px] text-slate-400">{current?.workerDays ?? 0} worker-days</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-400">This week · bata so far</p>
                  <p className="text-lg font-bold text-slate-900">{formatINR(current?.bata ?? 0)}</p>
                  <p className="text-[10px] text-slate-400">
                    plan {formatINR(planBata)} for {plannedWorkerDays} wd
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2">
                <div>
                  <p className="text-[11px] text-brand-800">Full-week plan</p>
                  <p className="text-base font-bold text-brand-900">{formatINR(planTotal)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onPlannedChange(Math.max(0, plannedWorkerDays - 1))}
                    className="h-8 w-8 rounded-lg bg-white text-lg font-bold text-brand-800"
                  >
                    −
                  </button>
                  <div className="text-center">
                    <input
                      inputMode="numeric"
                      value={plannedWorkerDays}
                      onChange={(e) => onPlannedChange(Math.max(0, Number(e.target.value) || 0))}
                      className="w-14 rounded-lg border border-brand-200 bg-white px-1 py-1 text-center text-sm font-semibold text-brand-900"
                    />
                    <p className="text-[9px] text-brand-700">worker-days</p>
                  </div>
                  <button
                    onClick={() => onPlannedChange(plannedWorkerDays + 1)}
                    className="h-8 w-8 rounded-lg bg-white text-lg font-bold text-brand-800"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Last 8 weeks</p>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-[10px] font-semibold">
                  <button
                    onClick={() => setMode("total")}
                    className={`rounded-md px-2 py-1 ${mode === "total" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`}
                  >
                    ₹
                  </button>
                  <button
                    onClick={() => setMode("perDay")}
                    className={`rounded-md px-2 py-1 ${mode === "perDay" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`}
                  >
                    per worker-day
                  </button>
                </div>
              </div>

              <div className="relative">
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-slate-300"
                  style={{ bottom: `${Math.min(100, (planLine / max) * 100)}%` }}
                />
                <div className="relative flex h-40 items-end gap-1.5">
                  {weeks.map((w) => {
                    const perDay = (v: number) => v / Math.max(1, w.workerDays);
                    const raw = mode === "perDay" ? perDay : (v: number) => v;
                    const displayTotal = raw(w.wages) + raw(w.bata);
                    const pct = (v: number) => (displayTotal > 0 ? (raw(v) / displayTotal) * 100 : 0);
                    const height = Math.max(2, (scale(w) / max) * 100);
                    return (
                      <button
                        key={w.from}
                        onClick={() => setSelectedFrom(w.from)}
                        className={`flex h-full flex-1 flex-col justify-end ${
                          selected?.from === w.from ? "opacity-100" : "opacity-80"
                        }`}
                        title={`${w.label} · ${formatINR(displayTotal)}`}
                      >
                        <div
                          className={`flex w-full flex-col-reverse overflow-hidden rounded-t-md ${
                            w.current ? "ring-1 ring-brand-400" : ""
                          }`}
                          style={{ height: `${height}%` }}
                        >
                          <div className={COLORS.wages} style={{ height: `${pct(w.wages)}%` }} />
                          <div className={COLORS.lunch} style={{ height: `${pct(w.lunch)}%` }} />
                          <div className={COLORS.travel} style={{ height: `${pct(w.travel)}%` }} />
                          <div className={COLORS.material} style={{ height: `${pct(w.material)}%` }} />
                          <div className={COLORS.other} style={{ height: `${pct(w.other)}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 flex gap-1.5">
                  {weeks.map((w) => (
                    <span key={w.from} className="flex-1 text-center text-[9px] text-slate-400">
                      {w.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <LegendDot className={COLORS.wages} label="Wages" />
                <LegendDot className={COLORS.lunch} label="Lunch" />
                <LegendDot className={COLORS.travel} label="Travel" />
                <LegendDot className={COLORS.material} label="Material" />
                <LegendDot className={COLORS.other} label="Other" />
              </div>

              {selected ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{prettyRange(selected.from, selected.to)}</p>
                    <span className="text-xs text-slate-500">{selected.workerDays} worker-days</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                    <span className="text-slate-500">Wages</span>
                    <span className="text-right font-semibold text-slate-900">{formatINR(selected.wages)}</span>
                    <span className="text-slate-500">Bata</span>
                    <span className="text-right font-semibold text-slate-900">{formatINR(selected.bata)}</span>
                    <span className="text-slate-500">Lunch / travel</span>
                    <span className="text-right text-slate-700">
                      {formatINR(selected.lunch)} / {formatINR(selected.travel)}
                    </span>
                    <span className="text-slate-500">Material / other</span>
                    <span className="text-right text-slate-700">
                      {formatINR(selected.material)} / {formatINR(selected.other)}
                    </span>
                    <span className="font-medium text-slate-700">Total</span>
                    <span className="text-right font-bold text-slate-900">
                      {formatINR(selected.wages + selected.bata)}
                    </span>
                    <span className="text-slate-500">Per worker-day</span>
                    <span className="text-right text-slate-700">
                      {selected.workerDays > 0
                        ? formatINR((selected.wages + selected.bata) / selected.workerDays)
                        : "—"}
                    </span>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

export function shortWeekLabel(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })}`;
}
