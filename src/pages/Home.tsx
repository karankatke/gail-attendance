import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Spinner } from "../components/ui";
import { requireClient } from "../lib/supabase";
import { fetchDayAttendance } from "../lib/db";
import { formatINR } from "../lib/pay";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import type { AttendanceStatus, BataReportRow, DayAttendanceRow, ReportRow } from "../lib/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Full",
  half_day: "Half",
  absent: "Absent",
};

const STATUS_PILL: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700",
  half_day: "bg-amber-50 text-amber-700",
  absent: "bg-red-50 text-red-600",
};

type DayCost = {
  wages: number;
  bata: number;
  lunch: number;
  travel: number;
  material: number;
  other: number;
};

export function HomePage() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<DayAttendanceRow[]>([]);
  const [cost, setCost] = useState<DayCost>({
    wages: 0,
    bata: 0,
    lunch: 0,
    travel: 0,
    material: 0,
    other: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const client = requireClient();
    try {
      const [a, rep, bata] = await Promise.all([
        fetchDayAttendance(date),
        client.rpc("report_range", { p_from: date, p_to: date, p_include_monthly: true }),
        client.rpc("report_bata", { p_from: date, p_to: date }),
      ]);
      setRows(a);
      const wages = ((rep.data ?? []) as ReportRow[]).reduce(
        (sum, r) => sum + Number(r.gross_pay),
        0,
      );
      const b = (bata.data ?? []) as BataReportRow[];
      setCost({
        wages,
        bata: b.reduce((s, x) => s + Number(x.spent), 0),
        lunch: b.reduce((s, x) => s + Number(x.lunch), 0),
        travel: b.reduce((s, x) => s + Number(x.travel), 0),
        material: b.reduce((s, x) => s + Number(x.material), 0),
        other: b.reduce((s, x) => s + Number(x.other), 0),
      });
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const client = requireClient();
    const channel = client
      .channel(`home-att-${date}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bata_expenses" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "workers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pay_overrides" }, load)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [date, load]);

  const siteGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; rows: DayAttendanceRow[] }>();
    for (const r of rows) {
      const key = r.location_id ?? "__none__";
      const entry = map.get(key) ?? {
        id: key,
        name: key === "__none__" ? "Unassigned" : r.location_name ?? "No site",
        rows: [],
      };
      entry.rows.push(r);
      map.set(key, entry);
    }
    return [...map.values()].sort(
      (a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name),
    );
  }, [rows]);

  const totals = useMemo(() => {
    const t = { present: 0, half: 0, absent: 0 };
    for (const r of rows) {
      if (r.status === "present") t.present += 1;
      else if (r.status === "half_day") t.half += 1;
      else t.absent += 1;
    }
    return t;
  }, [rows]);

  const headcount = totals.present + totals.half;

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="rounded-xl px-3 py-2 text-slate-500 active:bg-slate-100"
            aria-label="Previous day"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-semibold text-slate-900">{prettyDate(date)}</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="mt-0.5 bg-transparent text-center text-xs text-brand-700 underline"
            />
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            className="rounded-xl px-3 py-2 text-slate-500 active:bg-slate-100"
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="On site" value={String(headcount)} tone="emerald" />
        <Stat label="Half day" value={String(totals.half)} tone="amber" />
        <Stat label="Absent" value={String(totals.absent)} tone="red" />
      </div>

      {!loading && (rows.length > 0 || cost.bata > 0) ? (
        <Card className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">Spent today</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatINR(cost.wages + cost.bata)}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <p>{headcount} on site</p>
              <p>{prettyDate(date)}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-[10px] font-medium text-slate-400">Workers</p>
              <p className="text-sm font-semibold text-slate-900">{formatINR(cost.wages)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-[10px] font-medium text-slate-400">Bata (site cash)</p>
              <p className="text-sm font-semibold text-slate-900">{formatINR(cost.bata)}</p>
            </div>
          </div>
          {cost.bata > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span>
                Lunch <b className="text-slate-700">{formatINR(cost.lunch)}</b>
              </span>
              <span>
                Travel <b className="text-slate-700">{formatINR(cost.travel)}</b>
              </span>
              <span>
                Material <b className="text-slate-700">{formatINR(cost.material)}</b>
              </span>
              <span>
                Other <b className="text-slate-700">{formatINR(cost.other)}</b>
              </span>
            </div>
          ) : null}
        </Card>
      ) : null}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No attendance marked yet for this day.
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="px-1 text-sm font-medium text-slate-500">Marked by site</p>
          {siteGroups.map((g) => {
            const total = g.rows.filter((r) => r.status !== "absent").length;
            return (
              <Card key={g.id} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="truncate font-semibold text-slate-900">{g.name}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      total > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {total}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                  {g.rows.map((r) => (
                    <div key={r.worker_id} className="flex items-center justify-between gap-2 text-sm">
                      <p className="min-w-0 truncate text-slate-700">{r.worker_name}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-slate-400">
                          {r.marked_by_name ? `by ${r.marked_by_name}` : "—"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="pb-2 text-center text-[11px] text-slate-400">
        Read-only view. Supervisors mark attendance on their own phones.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber" | "emerald" | "red";
}) {
  const tones = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    red: "text-red-600",
  } as const;
  return (
    <Card className="p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  );
}
