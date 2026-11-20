import { useEffect, useMemo, useState } from "react";
import { Card, Spinner } from "./ui";
import { requireClient } from "../lib/supabase";
import { addDays, parseISO, prettyRange, todayISO, weekRange } from "../lib/dates";
import { formatINR } from "../lib/pay";
import type { BataReportRow, ReportRow } from "../lib/types";

interface TrendWeek {
  from: string;
  to: string;
  label: string;
  wages: number;
  bata: number;
  current: boolean;
}

function shortWeekLabel(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })}`;
}

export function TrendsSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState<TrendWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    (async () => {
      const client = requireClient();
      const thisWeek = weekRange(todayISO());
      const ranges = Array.from({ length: 8 }, (_, i) => {
        const idx = 7 - i;
        const from = addDays(thisWeek.from, -7 * idx);
        return { from, to: addDays(from, 6), current: idx === 0 };
      });
      const data = await Promise.all(
        ranges.map(async (r) => {
          const [rep, bata] = await Promise.all([
            client.rpc("report_range", {
              p_from: r.from,
              p_to: r.to,
              p_include_monthly: true,
            }),
            client.rpc("report_bata", { p_from: r.from, p_to: r.to }),
          ]);
          const rows = (rep.data ?? []) as ReportRow[];
          const b = (bata.data ?? []) as BataReportRow[];
          return {
            from: r.from,
            to: r.to,
            label: shortWeekLabel(r.from),
            wages: rows.reduce((s, x) => s + Number(x.gross_pay), 0),
            bata: b.reduce((s, x) => s + Number(x.spent), 0),
            current: r.current,
          };
        }),
      );
      if (!active) return;
      setWeeks(data);
      setLoading(false);
    })().catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, refreshKey]);

  const total = (w: TrendWeek) => w.wages + w.bata;
  const max = useMemo(() => Math.max(1, ...weeks.map(total)), [weeks]);
  const selected =
    weeks.find((w) => w.from === selectedFrom) ?? weeks[weeks.length - 1] ?? null;

  return (
    <Card className="p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">Trends</p>
          <p className="text-[11px] text-slate-400">
            Last 8 weeks · total money spent
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
              <div className="flex h-40 items-end gap-1.5">
                {weeks.map((w) => {
                  const value = total(w);
                  const isSelected = selected?.from === w.from;
                  return (
                    <button
                      key={w.from}
                      onClick={() => setSelectedFrom(w.from)}
                      className="flex h-full flex-1 flex-col justify-end"
                      title={`${w.label} · ${formatINR(value)}`}
                    >
                      <div
                        className={`w-full rounded-t-md transition-colors ${
                          isSelected
                            ? "bg-brand-600"
                            : "bg-brand-200 active:bg-brand-300"
                        } ${w.current ? "ring-1 ring-brand-400" : ""}`}
                        style={{ height: `${Math.max(3, (value / max) * 100)}%` }}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1.5">
                {weeks.map((w) => (
                  <span
                    key={w.from}
                    className={`flex-1 text-center text-[9px] ${
                      selected?.from === w.from
                        ? "font-semibold text-brand-700"
                        : "text-slate-400"
                    }`}
                  >
                    {w.label}
                  </span>
                ))}
              </div>

              {selected ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {prettyRange(selected.from, selected.to)}
                    </p>
                    <span className="text-[11px] text-slate-400">
                      {selected.current ? "This week" : ""}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                    <span className="text-slate-500">Wages</span>
                    <span className="text-right font-semibold text-slate-900">
                      {formatINR(selected.wages)}
                    </span>
                    <span className="text-slate-500">Bata spent</span>
                    <span className="text-right font-semibold text-slate-900">
                      {formatINR(selected.bata)}
                    </span>
                    <span className="font-medium text-slate-700">Total spent</span>
                    <span className="text-right font-bold text-slate-900">
                      {formatINR(total(selected))}
                    </span>
                  </div>
                </div>
              ) : null}

              <p className="text-[10px] text-slate-400">
                Tap a bar to see that week's total.
              </p>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
