import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { requireClient } from "../lib/supabase";
import { insertRow, removeRow, updateRow } from "../lib/db";
import {
  addDays,
  monthLabel,
  monthRange,
  parseISO,
  prettyDate,
  prettyRange,
  todayISO,
  toISODate,
  weekRange,
} from "../lib/dates";
import { formatINR } from "../lib/pay";
import type {
  AdjustmentType,
  Advance,
  BataReportRow,
  LocationReportRow,
  ReportRow,
  Worker,
} from "../lib/types";

type Mode = "week" | "month";

const TYPE_LABEL: Record<AdjustmentType, string> = {
  advance: "Advance",
  deduction: "Deduction",
  bonus: "Bonus",
};

export function ReportsPage() {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [locRows, setLocRows] = useState<LocationReportRow[]>([]);
  const [bataRows, setBataRows] = useState<BataReportRow[]>([]);
  const [adjustments, setAdjustments] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAdjust, setEditingAdjust] = useState<Advance | null>(null);
  const [addingFor, setAddingFor] = useState<ReportRow | null>(null);
  const [summary, setSummary] = useState<{ from: string; to: string } | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { rows: workers } = useTable<Worker>("workers", { orderColumn: "name" });

  const range = useMemo(
    () => (mode === "week" ? weekRange(anchor) : monthRange(anchor)),
    [mode, anchor],
  );

  const load = useCallback(async () => {
    const client = requireClient();
    const includeMonthly = mode === "month";
    const [r1, r2, r3, r4] = await Promise.all([
      client.rpc("report_range", {
        p_from: range.from,
        p_to: range.to,
        p_include_monthly: includeMonthly,
      }),
      client.rpc("report_by_location", { p_from: range.from, p_to: range.to }),
      client.rpc("report_bata", { p_from: range.from, p_to: range.to }),
      client
        .from("advances")
        .select("*")
        .gte("entry_date", range.from)
        .lte("entry_date", range.to)
        .order("entry_date", { ascending: false }),
    ]);
    setRows((r1.data ?? []) as ReportRow[]);
    setLocRows((r2.data ?? []) as LocationReportRow[]);
    setBataRows((r3.data ?? []) as BataReportRow[]);
    setAdjustments((r4.data ?? []) as Advance[]);
    setLoading(false);
  }, [mode, range.from, range.to]);

  useEffect(() => {
    load();
    const client = requireClient();
    const channel = client
      .channel(`reports-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "advances" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pay_overrides" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bata_grants" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bata_expenses" }, load)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [load, refreshKey]);

  const workerName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const w of workers) m[w.id] = w.name;
    return m;
  }, [workers]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          gross: acc.gross + Number(r.gross_pay),
          advances: acc.advances + Number(r.advances),
          deductions: acc.deductions + Number(r.deductions),
          bonuses: acc.bonuses + Number(r.bonuses),
          net: acc.net + Number(r.net_pay),
        }),
        { gross: 0, advances: 0, deductions: 0, bonuses: 0, net: 0 },
      ),
    [rows],
  );

  const bataSpent = useMemo(
    () => bataRows.reduce((s, b) => s + Number(b.spent), 0),
    [bataRows],
  );

  const withActivity = useMemo(
    () =>
      rows.filter(
        (r) =>
          Number(r.gross_pay) > 0 ||
          Number(r.advances) > 0 ||
          Number(r.deductions) > 0 ||
          Number(r.bonuses) > 0 ||
          r.days_present + r.days_half + r.days_absent > 0,
      ),
    [rows],
  );

  const step = (dir: number) => {
    if (mode === "week") setAnchor((a) => addDays(a, dir * 7));
    else {
      const d = parseISO(anchor);
      setAnchor(toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  };

  const recentWeeks = useMemo(() => {
    const thisFrom = weekRange(todayISO()).from;
    return Array.from({ length: 8 }, (_, i) => {
      const from = addDays(thisFrom, -7 * i);
      return { from, to: addDays(from, 6) };
    });
  }, []);

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
          {(["week", "month"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 text-sm font-semibold capitalize ${
                mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => step(-1)} className="rounded-xl px-3 py-2 text-slate-500 active:bg-slate-100">
            ‹
          </button>
          <p className="font-semibold text-slate-900">
            {mode === "week" ? prettyRange(range.from, range.to) : monthLabel(range.from)}
          </p>
          <button onClick={() => step(1)} className="rounded-xl px-3 py-2 text-slate-500 active:bg-slate-100">
            ›
          </button>
        </div>
        <p className="mt-1 text-center text-[11px] text-slate-400">
          {range.from} → {range.to}
          {mode === "month" ? " · includes monthly salaried" : ""}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Gross wages" value={formatINR(totals.gross)} />
        <Stat label="Net payable" value={formatINR(totals.net)} tone="emerald" />
        <Stat label="Advances + deductions" value={formatINR(totals.advances + totals.deductions)} tone="amber" />
        <Stat label="Bata (misc)" value={formatINR(bataSpent)} tone="amber" />
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-slate-500">Per worker</p>
      </div>

      {loading ? (
        <Spinner />
      ) : withActivity.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No attendance or payments in this {mode}.
        </Card>
      ) : (
        <div className="space-y-2">
          {withActivity.map((r) => (
            <Card key={r.worker_id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {r.worker_name}
                    {r.rate_mode === "month" ? (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">monthly</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.role_name ?? "No role"} · {r.days_present}F/{r.days_half}H/{r.days_absent}A
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{formatINR(Number(r.net_pay))}</p>
                  <p className="text-[11px] text-slate-400">gross {formatINR(Number(r.gross_pay))}</p>
                </div>
              </div>
              {Number(r.advances) > 0 || Number(r.deductions) > 0 || Number(r.bonuses) > 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  {Number(r.advances) > 0 ? `advance ${formatINR(Number(r.advances))} ` : ""}
                  {Number(r.deductions) > 0 ? `deduction ${formatINR(Number(r.deductions))} ` : ""}
                  {Number(r.bonuses) > 0 ? `bonus ${formatINR(Number(r.bonuses))}` : ""}
                </p>
              ) : null}
              <div className="mt-2">
                <Button variant="secondary" onClick={() => setAddingFor(r)} className="w-full py-2 text-xs">
                  + Advance / deduction
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adjustments.length > 0 ? (
        <div className="pt-2">
          <p className="mb-2 px-1 text-sm font-medium text-slate-500">Payments in this {mode}</p>
          <div className="space-y-2">
            {adjustments.map((a) => (
              <Card key={a.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {workerName[a.worker_id] ?? "Worker"}{" "}
                      <span className="text-xs font-normal text-slate-500">{TYPE_LABEL[a.type]}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {prettyDate(a.entry_date)}
                      {a.note ? ` · ${a.note}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-semibold text-slate-900">{formatINR(Number(a.amount))}</span>
                    <button
                      onClick={() => setEditingAdjust(a)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 active:bg-brand-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        await removeRow("advances", a.id);
                        refresh();
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 active:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {locRows.length > 0 ? (
        <div className="pt-2">
          <p className="mb-2 px-1 text-sm font-medium text-slate-500">Cost by site</p>
          <Card className="divide-y divide-slate-100">
            {locRows.map((l) => (
              <div key={l.location_id ?? "none"} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium text-slate-800">{l.location_name}</p>
                  <p className="text-xs text-slate-500">{l.worker_days} worker-days</p>
                </div>
                <p className="font-semibold text-slate-900">{formatINR(Number(l.gross_pay))}</p>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {bataRows.length > 0 ? (
        <div className="pt-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-medium text-slate-500">Bata (misc)</p>
            <Button variant="ghost" onClick={() => setGrantOpen(true)}>
              + Give bata
            </Button>
          </div>
          <Card className="divide-y divide-slate-100">
            {bataRows.map((b) => (
              <div key={b.supervisor_profile_id} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{b.supervisor_name}</p>
                  <p className="font-semibold text-slate-900">{formatINR(Number(b.spent))} spent</p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  given {formatINR(Number(b.granted))} · balance {formatINR(Number(b.balance))} ·
                  lunch {formatINR(Number(b.lunch))} · travel {formatINR(Number(b.travel))} ·
                  material {formatINR(Number(b.material))} · other {formatINR(Number(b.other))}
                </p>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {mode === "week" ? (
        <div className="pt-2">
          <p className="mb-2 px-1 text-sm font-medium text-slate-500">Weeks</p>
          <Card className="divide-y divide-slate-100">
            {recentWeeks.map((w) => (
              <button
                key={w.from}
                onClick={() => setSummary(w)}
                className="flex w-full items-center justify-between p-3 text-left"
              >
                <span className="font-medium text-slate-800">{prettyRange(w.from, w.to)}</span>
                <span className="text-xs text-slate-400">view summary ›</span>
              </button>
            ))}
          </Card>
        </div>
      ) : null}

      {addingFor ? (
        <AdjustmentForm
          row={addingFor}
          onClose={() => setAddingFor(null)}
          onSaved={() => {
            setAddingFor(null);
            refresh();
          }}
        />
      ) : null}

      {editingAdjust ? (
        <AdjustmentEditForm
          adjustment={editingAdjust}
          workerName={workerName[editingAdjust.worker_id] ?? "Worker"}
          onClose={() => setEditingAdjust(null)}
          onSaved={() => {
            setEditingAdjust(null);
            refresh();
          }}
        />
      ) : null}

      {summary ? <WeekSummary from={summary.from} to={summary.to} onClose={() => setSummary(null)} /> : null}

      {grantOpen ? (
        <GrantForm
          supervisors={bataRows}
          onClose={() => setGrantOpen(false)}
          onSaved={() => {
            setGrantOpen(false);
            refresh();
          }}
        />
      ) : null}
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
  tone?: "slate" | "amber" | "emerald";
}) {
  const tones = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  } as const;
  return (
    <Card className="p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  );
}

function GrantForm({
  supervisors,
  onClose,
  onSaved,
}: {
  supervisors: BataReportRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [profileId, setProfileId] = useState(supervisors[0]?.supervisor_profile_id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const amt = Number(amount);
    if (!profileId) {
      setError("Pick a supervisor.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await insertRow("bata_grants", {
        supervisor_profile_id: profileId,
        grant_date: date,
        amount: amt,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <Modal title="Give bata cash" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Supervisor">
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={inputClass}>
            {supervisors.map((s) => (
              <option key={s.supervisor_profile_id} value={s.supervisor_profile_id}>
                {s.supervisor_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. weekly cash" />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function WeekSummary({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const client = requireClient();
      const { data } = await client.rpc("report_range", {
        p_from: from,
        p_to: to,
        p_include_monthly: false,
      });
      if (active) {
        setRows((data ?? []) as ReportRow[]);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [from, to]);

  const active_rows = rows.filter((r) => Number(r.gross_pay) > 0 || Number(r.net_pay) !== 0);
  const totalNet = active_rows.reduce((s, r) => s + Number(r.net_pay), 0);

  return (
    <Modal title={prettyRange(from, to)} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {active_rows.length === 0 ? (
            <p className="text-sm text-slate-500">No activity this week.</p>
          ) : (
            active_rows.map((r) => (
              <div key={r.worker_id} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{r.worker_name}</p>
                  <p className="text-xs text-slate-500">
                    {r.days_present}F/{r.days_half}H/{r.days_absent}A
                  </p>
                </div>
                <p className="font-semibold text-slate-900">{formatINR(Number(r.net_pay))}</p>
              </div>
            ))
          )}
          <div className="flex items-center justify-between pt-2">
            <p className="font-semibold text-slate-700">Week total</p>
            <p className="font-bold text-slate-900">{formatINR(totalNet)}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AdjustmentForm({
  row,
  onClose,
  onSaved,
}: {
  row: ReportRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<AdjustmentType>("advance");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await insertRow("advances", {
        worker_id: row.worker_id,
        entry_date: date,
        type,
        amount: amt,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <Modal title={`${row.worker_name} · payment`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Type">
          <div className="grid grid-cols-3 gap-1.5">
            {(["advance", "deduction", "bonus"] as AdjustmentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  type === t ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Amount (₹)">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="reason" />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function AdjustmentEditForm({
  adjustment,
  workerName,
  onClose,
  onSaved,
}: {
  adjustment: Advance;
  workerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<AdjustmentType>(adjustment.type);
  const [amount, setAmount] = useState(String(adjustment.amount));
  const [date, setDate] = useState(adjustment.entry_date);
  const [note, setNote] = useState(adjustment.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateRow("advances", adjustment.id, {
        entry_date: date,
        type,
        amount: amt,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeRow("advances", adjustment.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <Modal title={`${workerName} · edit`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Type">
          <div className="grid grid-cols-3 gap-1.5">
            {(["advance", "deduction", "bonus"] as AdjustmentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  type === t ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Amount (₹)">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
