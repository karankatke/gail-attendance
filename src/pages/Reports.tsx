import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { requireClient } from "../lib/supabase";
import { insertRow } from "../lib/db";
import {
  addDays,
  monthLabel,
  monthRange,
  parseISO,
  prettyRange,
  todayISO,
  toISODate,
  weekRange,
} from "../lib/dates";
import { formatINR } from "../lib/pay";
import type { AdjustmentType, LocationReportRow, ReportRow, Worker } from "../lib/types";

type Mode = "week" | "month";

export function ReportsPage() {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [locRows, setLocRows] = useState<LocationReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [advanceFor, setAdvanceFor] = useState<ReportRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { rows: workers } = useTable<Worker>("workers", { orderColumn: "name" });

  const range = useMemo(
    () => (mode === "week" ? weekRange(anchor) : monthRange(anchor)),
    [mode, anchor],
  );

  const load = useCallback(async () => {
    const client = requireClient();
    const [r1, r2] = await Promise.all([
      client.rpc("report_range", { p_from: range.from, p_to: range.to }),
      client.rpc("report_by_location", { p_from: range.from, p_to: range.to }),
    ]);
    setRows((r1.data ?? []) as ReportRow[]);
    setLocRows((r2.data ?? []) as LocationReportRow[]);
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => {
    load();
    const client = requireClient();
    const channel = client
      .channel(`reports-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "advances" }, load)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [load, refreshKey]);

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
    if (mode === "week") {
      setAnchor((a) => addDays(a, dir * 7));
    } else {
      const d = parseISO(anchor);
      setAnchor(toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  };

  const exportCsv = () => {
    const header = [
      "Worker",
      "Role",
      "Full days",
      "Half days",
      "Absent",
      "Hours",
      "Gross",
      "Advances",
      "Deductions",
      "Bonuses",
      "Net",
    ];
    const lines = withActivity.map((r) =>
      [
        r.worker_name,
        r.role_name ?? "",
        r.days_present,
        r.days_half,
        r.days_absent,
        r.total_hours,
        r.gross_pay,
        r.advances,
        r.deductions,
        r.bonuses,
        r.net_pay,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const totalsLine = [
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      totals.gross,
      totals.advances,
      totals.deductions,
      totals.bonuses,
      totals.net,
    ]
      .map((v) => `"${String(v)}"`)
      .join(",");
    const csv = [header.join(","), ...lines, totalsLine].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${mode}-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Gross wages" value={formatINR(totals.gross)} />
        <Stat label="Advances + deductions" value={formatINR(totals.advances + totals.deductions)} tone="amber" />
        <Stat label="Net payable" value={formatINR(totals.net)} tone="emerald" />
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-slate-500">Per worker</p>
        <Button variant="ghost" onClick={exportCsv} disabled={withActivity.length === 0}>
          Export CSV
        </Button>
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
                  <p className="truncate font-semibold text-slate-900">{r.worker_name}</p>
                  <p className="text-xs text-slate-500">
                    {r.role_name ?? "No role"} · {r.days_present}F/{r.days_half}H/{r.days_absent}A
                    {Number(r.total_hours) > 0 ? ` · ${r.total_hours}h` : ""}
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
                <Button variant="secondary" onClick={() => setAdvanceFor(r)} className="w-full py-2 text-xs">
                  + Advance / deduction
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

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

      {advanceFor ? (
        <AdvanceForm
          row={advanceFor}
          workers={workers}
          onClose={() => setAdvanceFor(null)}
          onSaved={() => {
            setAdvanceFor(null);
            setRefreshKey((k) => k + 1);
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

function AdvanceForm({
  row,
  workers,
  onClose,
  onSaved,
}: {
  row: ReportRow;
  workers: Worker[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const worker = workers.find((w) => w.id === row.worker_id);
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
    <Modal title={`${worker?.name ?? row.worker_name} · payment`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Type">
          <div className="grid grid-cols-3 gap-1.5">
            {(["advance", "deduction", "bonus"] as AdjustmentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-xl py-2 text-sm font-semibold capitalize ${
                  type === t ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {t}
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
