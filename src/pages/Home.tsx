import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Spinner } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { requireClient } from "../lib/supabase";
import { fetchDayAttendance } from "../lib/db";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import type { AttendanceStatus, DayAttendanceRow, WorkLocation } from "../lib/types";

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

export function HomePage() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<DayAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });

  const load = useCallback(async () => {
    try {
      setRows(await fetchDayAttendance(date));
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
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [date, load]);

  const bySite = useMemo(() => {
    const map = new Map<string, DayAttendanceRow[]>();
    for (const r of rows) {
      const key = r.location_id ?? "__none__";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
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

  const activeLocations = useMemo(() => locations.filter((l) => l.active), [locations]);
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

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No attendance marked yet for this day.
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="px-1 text-sm font-medium text-slate-500">Marked by site</p>
          {activeLocations.map((l) => {
            const list = bySite.get(l.id) ?? [];
            const total = list.filter((r) => r.status !== "absent").length;
            return (
              <Card key={l.id} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="truncate font-semibold text-slate-900">{l.name}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      total > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {total}
                  </span>
                </div>
                {list.length > 0 ? (
                  <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                    {list.map((r) => (
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
                ) : null}
              </Card>
            );
          })}
          {(bySite.get("__none__") ?? []).length > 0 ? (
            <Card className="p-3">
              <p className="font-semibold text-slate-900">Unassigned</p>
              <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                {(bySite.get("__none__") ?? []).map((r) => (
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
          ) : null}
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
