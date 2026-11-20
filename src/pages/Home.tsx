import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { requireClient } from "../lib/supabase";
import { fetchDayAttendance, insertRow } from "../lib/db";
import { formatINR } from "../lib/pay";
import { addDays, prettyDate, todayISO } from "../lib/dates";
import type {
  AttendanceStatus,
  BataReportRow,
  DayAttendanceRow,
  Profile,
  ReportRow,
} from "../lib/types";

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
};

type SupervisorInfo = { id: string; name: string };

export function HomePage() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<DayAttendanceRow[]>([]);
  const [cost, setCost] = useState<DayCost>({ wages: 0, bata: 0 });
  const [bataRows, setBataRows] = useState<BataReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [givingTo, setGivingTo] = useState<SupervisorInfo | null>(null);
  const loadSeq = useRef(0);
  const { rows: profiles, loading: profilesLoading } = useTable<Profile>("profiles", {
    orderColumn: "display_name",
  });

  const load = useCallback(async () => {
    const client = requireClient();
    const seq = ++loadSeq.current;
    try {
      const [a, rep, bata] = await Promise.all([
        fetchDayAttendance(date),
        client.rpc("report_range", { p_from: date, p_to: date, p_include_monthly: true }),
        client.rpc("report_bata", { p_from: date, p_to: date }),
      ]);
      if (seq !== loadSeq.current) return;
      setRows(a);
      const wages = ((rep.data ?? []) as ReportRow[]).reduce(
        (sum, r) => sum + Number(r.gross_pay),
        0,
      );
      const b = (bata.data ?? []) as BataReportRow[];
      setBataRows(b);
      setCost({
        wages,
        bata: b.reduce((s, x) => s + Number(x.spent), 0),
      });
    } finally {
      if (seq === loadSeq.current) setLoading(false);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "bata_grants" }, load)
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

  const headcount = useMemo(
    () => rows.filter((r) => r.status !== "absent").length,
    [rows],
  );

  const bataBySupervisor = useMemo(() => {
    const map = new Map<string, BataReportRow>();
    for (const b of bataRows) map.set(b.supervisor_profile_id, b);
    return map;
  }, [bataRows]);

  const supervisors = useMemo<SupervisorInfo[]>(() => {
    const active = profiles
      .filter((p) => p.role === "supervisor" && p.active)
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((p) => ({ id: p.id, name: p.display_name }));
    if (active.length > 0) return active;
    return bataRows.map((b) => ({
      id: b.supervisor_profile_id,
      name: b.supervisor_name,
    }));
  }, [profiles, bataRows]);

  const isToday = date === todayISO();

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
            <p className="text-base font-semibold text-slate-900">{prettyDate(date)}</p>
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

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card className="flex items-baseline gap-3 p-4">
            <p className="text-4xl font-bold text-emerald-700">{headcount}</p>
            <div>
              <p className="text-sm font-semibold text-slate-700">On site</p>
              <p className="text-xs text-slate-400">
                {prettyDate(date)} · {headcount === 1 ? "worker" : "workers"} marked
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-sm font-medium text-slate-500">
              {isToday ? "Spent today" : "Cost for the day"}
            </p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {formatINR(cost.wages + cost.bata)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Workers</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">
                  {formatINR(cost.wages)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Bata (site cash)</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">
                  {formatINR(cost.bata)}
                </p>
              </div>
            </div>
          </Card>

          <div>
            <div className="mb-2 px-1">
              <p className="text-sm font-semibold text-slate-700">Supervisors</p>
              <p className="text-xs text-slate-400">
                Bata given and spent · {prettyDate(date)}
              </p>
            </div>
            {profilesLoading ? (
              <Card className="p-4 text-sm text-slate-400">Loading supervisors…</Card>
            ) : supervisors.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">
                No supervisors yet. Add them under More → People.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {supervisors.map((s) => (
                  <SupervisorPanel
                    key={s.id}
                    name={s.name}
                    bata={bataBySupervisor.get(s.id) ?? null}
                    onGive={() => setGivingTo(s)}
                  />
                ))}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-500">
              No attendance marked yet for this day.
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="px-1 text-sm font-semibold text-slate-600">Marked by site</p>
              {siteGroups.map((g) => {
                const total = g.rows.filter((r) => r.status !== "absent").length;
                return (
                  <Card key={g.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-base font-semibold text-slate-900">{g.name}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                          total > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {total}
                      </span>
                    </div>
                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                      {g.rows.map((r) => (
                        <div
                          key={r.worker_id}
                          className="flex items-center justify-between gap-2"
                        >
                          <p className="min-w-0 truncate text-[15px] text-slate-700">
                            {r.worker_name}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-slate-400">
                              {r.marked_by_name ? `by ${r.marked_by_name}` : "—"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[r.status]}`}
                            >
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

          <p className="pb-2 text-center text-xs text-slate-400">
            Supervisors mark attendance and their own bata spending. Give bata from a supervisor
            card.
          </p>
        </>
      )}

      {givingTo ? (
        <GiveBataForm
          supervisor={givingTo}
          defaultDate={date}
          onClose={() => setGivingTo(null)}
          onSaved={async () => {
            setGivingTo(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function SupervisorPanel({
  name,
  bata,
  onGive,
}: {
  name: string;
  bata: BataReportRow | null;
  onGive: () => void;
}) {
  const given = Number(bata?.granted ?? 0);
  const spent = Number(bata?.spent ?? 0);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
          {initials || "S"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-slate-900">{name}</p>
          <p className="text-xs text-slate-400">Supervisor</p>
        </div>
        <Button onClick={onGive} className="shrink-0 px-3 py-2 text-sm">
          + Give bata
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-50/80 p-2.5">
          <p className="text-[11px] font-medium text-emerald-700">Bata given</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-800">{formatINR(given)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5">
          <p className="text-[11px] font-medium text-slate-500">Spent</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{formatINR(spent)}</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <span className="flex justify-between gap-2 text-slate-500">
          Lunch <b className="text-slate-800">{formatINR(Number(bata?.lunch ?? 0))}</b>
        </span>
        <span className="flex justify-between gap-2 text-slate-500">
          Travel <b className="text-slate-800">{formatINR(Number(bata?.travel ?? 0))}</b>
        </span>
        <span className="flex justify-between gap-2 text-slate-500">
          Material <b className="text-slate-800">{formatINR(Number(bata?.material ?? 0))}</b>
        </span>
        <span className="flex justify-between gap-2 text-slate-500">
          Other <b className="text-slate-800">{formatINR(Number(bata?.other ?? 0))}</b>
        </span>
      </div>
    </Card>
  );
}

function GiveBataForm({
  supervisor,
  defaultDate,
  onClose,
  onSaved,
}: {
  supervisor: SupervisorInfo;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quick = [500, 1000, 2000, 5000];

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount given.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await insertRow("bata_grants", {
        supervisor_profile_id: supervisor.id,
        grant_date: date,
        amount: value,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the bata grant");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Give bata · ${supervisor.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Cash given to <b className="text-slate-800">{supervisor.name}</b>. They record how it
          is spent.
        </p>

        <Field label="Amount (₹)">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} py-3 text-center text-2xl font-bold`}
            placeholder="0"
          />
        </Field>

        <div className="grid grid-cols-4 gap-1.5">
          {quick.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className={`rounded-lg py-2 text-xs font-semibold ${
                Number(amount) === v
                  ? "bg-brand-700 text-white"
                  : "bg-slate-100 text-slate-700 active:bg-slate-200"
              }`}
            >
              ₹{v.toLocaleString("en-IN")}
            </button>
          ))}
        </div>

        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayISO())}
            className={inputClass}
          />
        </Field>

        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="e.g. weekly site cash"
          />
        </Field>

        {error ? (
          <p className="rounded-xl bg-red-50 p-2.5 text-sm font-medium text-red-700">{error}</p>
        ) : null}

        <Button onClick={save} disabled={busy} className="w-full py-3">
          {busy ? "Saving…" : `Give ${amount ? formatINR(Number(amount)) : "bata"}`}
        </Button>
      </div>
    </Modal>
  );
}
