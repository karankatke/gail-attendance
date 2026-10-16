import { useMemo, useState } from "react";
import { Card, Empty, Spinner } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { useAttendance } from "../hooks/useAttendance";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import type { WorkLocation } from "../lib/types";

export function HomePage() {
  const [date, setDate] = useState(todayISO());
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });
  const { byWorker, loading } = useAttendance(date);

  const perSite = useMemo(() => {
    const map: Record<string, { present: number; half: number; absent: number }> = {};
    let unassigned = 0;
    for (const a of Object.values(byWorker)) {
      const key = a.location_id ?? "__none__";
      if (!a.location_id) unassigned += 1;
      const bucket = (map[key] ??= { present: 0, half: 0, absent: 0 });
      if (a.status === "present") bucket.present += 1;
      else if (a.status === "half_day") bucket.half += 1;
      else bucket.absent += 1;
    }
    return { map, unassigned };
  }, [byWorker]);

  const totals = useMemo(() => {
    const t = { present: 0, half: 0, absent: 0 };
    for (const b of Object.values(perSite.map)) {
      t.present += b.present;
      t.half += b.half;
      t.absent += b.absent;
    }
    return t;
  }, [perSite]);

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
      ) : activeLocations.length === 0 ? (
        <Empty title="No sites yet" hint="Add sites under the Sites tab." />
      ) : (
        <div className="space-y-2">
          <p className="px-1 text-sm font-medium text-slate-500">Headcount by site</p>
          {activeLocations.map((l) => {
            const b = perSite.map[l.id] ?? { present: 0, half: 0, absent: 0 };
            const total = b.present + b.half;
            return (
              <Card key={l.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{l.name}</p>
                    <p className="text-xs text-slate-500">
                      {b.present} full · {b.half} half · {b.absent} absent
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      total > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {total}
                  </span>
                </div>
              </Card>
            );
          })}
          {perSite.unassigned > 0 ? (
            <Card className="p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-600">Unassigned</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">
                  {perSite.unassigned}
                </span>
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
