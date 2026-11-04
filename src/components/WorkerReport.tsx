import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Spinner } from "./ui";
import { requireClient } from "../lib/supabase";
import { fetchWorkerAttendance, type WorkerAttendanceDay } from "../lib/db";
import { addDays, monthLabel, monthRange, parseISO, prettyDate, prettyRange, todayISO, toISODate, weekRange } from "../lib/dates";
import { formatINR } from "../lib/pay";
import type { AttendanceStatus, ReportRow } from "../lib/types";

const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: "Full day",
  half_day: "Half day",
  absent: "Absent",
};

const STATUS_DOT: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  half_day: "bg-amber-400",
  absent: "bg-red-500",
};

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type MonthStat = { key: string; label: string; present: number; half: number; absent: number };

export function WorkerReportSheet({
  row,
  locationName,
  onClose,
  onAddAdjustment,
}: {
  row: ReportRow;
  locationName: (id: string | null) => string;
  onClose: () => void;
  onAddAdjustment: () => void;
}) {
  const [tab, setTab] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [days, setDays] = useState<WorkerAttendanceDay[]>([]);
  const [summary, setSummary] = useState<ReportRow | null>(null);
  const [history, setHistory] = useState<MonthStat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(
    () => (tab === "week" ? weekRange(anchor) : monthRange(anchor)),
    [tab, anchor],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelected(null);
    (async () => {
      const [d, s] = await Promise.all([
        fetchWorkerAttendance(row.worker_id, range.from, range.to),
        requireClient().rpc("report_range", {
          p_from: range.from,
          p_to: range.to,
          p_include_monthly: row.rate_mode === "month",
        }),
      ]);
      if (!active) return;
      setDays(d);
      const summaryRow =
        ((s.data ?? []) as ReportRow[]).find((r) => r.worker_id === row.worker_id) ?? null;
      setSummary(summaryRow);
      setLoading(false);
    })().catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [row.worker_id, row.rate_mode, range.from, range.to]);

  useEffect(() => {
    let active = true;
    (async () => {
      const today = todayISO();
      const d = parseISO(today);
      const start = toISODate(new Date(d.getFullYear(), d.getMonth() - 5, 1));
      try {
        const rows = await fetchWorkerAttendance(row.worker_id, start, today);
        if (!active) return;
        const byMonth = new Map<string, MonthStat>();
        for (const r of rows) {
          const key = r.work_date.slice(0, 7);
          const entry = byMonth.get(key) ?? {
            key,
            label: monthLabel(`${key}-01`),
            present: 0,
            half: 0,
            absent: 0,
          };
          if (r.status === "present") entry.present += 1;
          else if (r.status === "half_day") entry.half += 1;
          else entry.absent += 1;
          byMonth.set(key, entry);
        }
        setHistory([...byMonth.values()].sort((a, b) => b.key.localeCompare(a.key)));
      } catch {
        if (active) setHistory([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [row.worker_id]);

  const dayByDate = useMemo(() => {
    const m = new Map<string, WorkerAttendanceDay>();
    for (const d of days) m.set(d.work_date, d);
    return m;
  }, [days]);

  const counts = useMemo(() => {
    const c = { present: 0, half: 0, absent: 0 };
    for (const d of days) {
      if (d.status === "present") c.present += 1;
      else if (d.status === "half_day") c.half += 1;
      else c.absent += 1;
    }
    return c;
  }, [days]);

  const step = (dir: number) => {
    if (tab === "week") {
      setAnchor((a) => addDays(a, dir * 7));
    } else {
      const d = parseISO(anchor);
      setAnchor(toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  };

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(range.from, i)),
    [range.from],
  );

  const monthCells = useMemo(() => {
    if (tab !== "month") return [] as (string | null)[];
    const first = parseISO(range.from);
    const lead = (first.getDay() + 6) % 7;
    const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let i = 0; i < total; i++) {
      cells.push(toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1)));
    }
    return cells;
  }, [tab, range.from]);

  const selectedDay = selected ? dayByDate.get(selected) ?? null : null;
  const today = todayISO();

  const dotClass = (date: string) => {
    const d = dayByDate.get(date);
    return d ? STATUS_DOT[d.status] : "bg-slate-200";
  };

  return (
    <Modal title={row.worker_name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{row.role_name ?? "No role"}</p>
          <button onClick={() => setAnchor(todayISO())} className="text-xs font-semibold text-brand-700">
            Today
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTab(m)}
              className={`rounded-lg py-2 text-sm font-semibold capitalize ${
                tab === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => step(-1)} className="rounded-xl px-3 py-1.5 text-slate-500 active:bg-slate-100">
            ‹
          </button>
          <p className="text-sm font-semibold text-slate-900">
            {tab === "week" ? prettyRange(range.from, range.to) : monthLabel(range.from)}
          </p>
          <button onClick={() => step(1)} className="rounded-xl px-3 py-1.5 text-slate-500 active:bg-slate-100">
            ›
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="On site" value={String(counts.present + counts.half)} tone="emerald" />
          <MiniStat label="Half" value={String(counts.half)} tone="amber" />
          <MiniStat label="Absent" value={String(counts.absent)} tone="red" />
        </div>

        <div className="rounded-xl bg-brand-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-brand-800">Wages (gross)</span>
            <span className="font-semibold text-brand-900">
              {summary ? formatINR(Number(summary.gross_pay)) : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-brand-800">Net payable</span>
            <span className="font-bold text-brand-900">
              {summary ? formatINR(Number(summary.net_pay)) : "—"}
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <>
            {tab === "week" ? (
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    className={`rounded-xl border p-1.5 text-center ${
                      selected === d ? "border-brand-500 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <p className="text-[10px] text-slate-400">{WEEK_LABELS[i]}</p>
                    <p className="text-sm font-semibold text-slate-800">{parseISO(d).getDate()}</p>
                    <span className={`mx-auto mt-1 block h-2 w-2 rounded-full ${dotClass(d)}`} />
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
                  {WEEK_LABELS.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthCells.map((d, i) =>
                    d ? (
                      <button
                        key={d}
                        onClick={() => setSelected(d)}
                        className={`relative rounded-lg border py-1.5 text-center text-xs font-medium ${
                          selected === d
                            ? "border-brand-500 bg-brand-50 text-brand-800"
                            : d === today
                              ? "border-brand-300 text-brand-800"
                              : "border-slate-200 text-slate-700"
                        }`}
                      >
                        {parseISO(d).getDate()}
                        <span className={`mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full ${dotClass(d)}`} />
                      </button>
                    ) : (
                      <span key={`blank-${i}`} />
                    ),
                  )}
                </div>
              </div>
            )}

            {selected ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">{prettyDate(selected)}</p>
                {selectedDay ? (
                  <>
                    <p className="mt-0.5 text-slate-600">
                      {STATUS_TEXT[selectedDay.status]} · {locationName(selectedDay.location_id)}
                    </p>
                    {selectedDay.note ? (
                      <p className="mt-0.5 text-xs text-slate-500">{selectedDay.note}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-0.5 text-slate-500">No attendance marked.</p>
                )}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400">Tap a day to see the site and status.</p>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-slate-500">Last 6 months</p>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400">No attendance in the last 6 months.</p>
              ) : (
                <div className="space-y-1.5">
                  {history.map((h) => (
                    <button
                      key={h.key}
                      onClick={() => {
                        setTab("month");
                        setAnchor(`${h.key}-01`);
                      }}
                      className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-left active:bg-slate-100"
                    >
                      <span className="text-sm text-slate-700">{h.label}</span>
                      <span className="text-xs text-slate-500">
                        {h.present}F · {h.half}H · {h.absent}A
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <Button variant="secondary" onClick={onAddAdjustment} className="w-full">
          + Advance / deduction
        </Button>
      </div>
    </Modal>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "red";
}) {
  const color =
    tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-red-600";
  return (
    <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
