import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Field, Modal, Spinner, inputClass } from "../components/ui";
import { useTable } from "../hooks/useTable";
import { useAuth } from "../context/AuthContext";
import { requireClient } from "../lib/supabase";
import { insertRow, removeRow } from "../lib/db";
import { prettyDate, todayISO } from "../lib/dates";
import { formatINR } from "../lib/pay";
import type { BataCategory, BataExpense, BataGrant, WorkLocation } from "../lib/types";

const CATEGORY_LABEL: Record<BataCategory, string> = {
  lunch: "Lunch",
  travel: "Travel / Tempo",
  material: "Material",
  other: "Other",
};

export function BataPage() {
  const { profile } = useAuth();
  const [grants, setGrants] = useState<BataGrant[]>([]);
  const [expenses, setExpenses] = useState<BataExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const { rows: locations } = useTable<WorkLocation>("locations", { orderColumn: "name" });

  const load = useCallback(async () => {
    if (!profile) return;
    const client = requireClient();
    const [g, e] = await Promise.all([
      client
        .from("bata_grants")
        .select("*")
        .eq("supervisor_profile_id", profile.id)
        .order("grant_date", { ascending: false }),
      client
        .from("bata_expenses")
        .select("*")
        .eq("supervisor_profile_id", profile.id)
        .order("expense_date", { ascending: false }),
    ]);
    setGrants((g.data ?? []) as BataGrant[]);
    setExpenses((e.data ?? []) as BataExpense[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
    const client = requireClient();
    const channel = client
      .channel(`bata-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bata_grants" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bata_expenses" }, load)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [load]);

  const totals = useMemo(() => {
    const granted = grants.reduce((s, g) => s + Number(g.amount), 0);
    const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { granted, spent, balance: granted - spent };
  }, [grants, expenses]);

  const locationName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of locations) m[l.id] = l.name;
    return m;
  }, [locations]);

  const remove = async (id: string) => {
    await removeRow("bata_expenses", id);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Given to you" value={formatINR(totals.granted)} tone="slate" />
        <Stat label="Spent" value={formatINR(totals.spent)} tone="amber" />
        <Stat label="Balance" value={formatINR(totals.balance)} tone={totals.balance < 0 ? "red" : "emerald"} />
      </div>

      <Button onClick={() => setAdding(true)} className="w-full">
        + Add expense
      </Button>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {expenses.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-sm font-medium text-slate-500">Your expenses</p>
              <div className="space-y-2">
                {expenses.map((e) => (
                  <Card key={e.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {CATEGORY_LABEL[e.category] ?? e.category}
                          {e.qty != null && e.unit_rate != null ? (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              {e.qty} × {formatINR(Number(e.unit_rate))}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {prettyDate(e.expense_date)}
                          {e.location_id && locationName[e.location_id] ? ` · ${locationName[e.location_id]}` : ""}
                          {e.note ? ` · ${e.note}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-slate-900">{formatINR(Number(e.amount))}</span>
                        <button
                          onClick={() => remove(e.id)}
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
          ) : (
            <Empty title="No expenses yet" hint="Add what you spent from the bata cash." />
          )}

          {grants.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-sm font-medium text-slate-500">Cash received from owner</p>
              <Card className="divide-y divide-slate-100">
                {grants.map((g) => (
                  <div key={g.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium text-slate-800">{formatINR(Number(g.amount))}</p>
                      <p className="text-xs text-slate-500">
                        {prettyDate(g.grant_date)}
                        {g.note ? ` · ${g.note}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          ) : null}
        </>
      )}

      {adding && profile ? (
        <ExpenseForm
          profileId={profile.id}
          locations={locations}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load();
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
      <p className={`mt-0.5 text-base font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  );
}

function ExpenseForm({
  profileId,
  locations,
  onClose,
  onSaved,
}: {
  profileId: string;
  locations: WorkLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<BataCategory>("lunch");
  const [date, setDate] = useState(todayISO());
  const [qty, setQty] = useState("");
  const [unitRate, setUnitRate] = useState("");
  const [amount, setAmount] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computed = useMemo(() => {
    if (category === "lunch") {
      const q = Number(qty);
      const r = Number(unitRate);
      if (Number.isFinite(q) && Number.isFinite(r)) return q * r;
      return 0;
    }
    return Number(amount) || 0;
  }, [category, qty, unitRate, amount]);

  const save = async () => {
    if (computed <= 0) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await insertRow("bata_expenses", {
        supervisor_profile_id: profileId,
        expense_date: date,
        category,
        qty: category === "lunch" && qty.trim() !== "" ? Number(qty) : null,
        unit_rate: category === "lunch" && unitRate.trim() !== "" ? Number(unitRate) : null,
        amount: computed,
        note: note.trim() || null,
        location_id: locationId || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <Modal title="Add bata expense" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Category">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(CATEGORY_LABEL) as BataCategory[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  category === c ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>

        {category === "lunch" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Count (people)">
              <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} placeholder="0" />
            </Field>
            <Field label="Rate per person (₹)">
              <input inputMode="decimal" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} className={inputClass} placeholder="0" />
            </Field>
          </div>
        ) : (
          <Field label="Amount (₹)">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
          </Field>
        )}

        <p className="rounded-xl bg-brand-50 p-2.5 text-center text-sm font-semibold text-brand-800">
          Total: {formatINR(computed)}
        </p>

        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Site (optional)">
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
            <option value="">— none —</option>
            {locations.filter((l) => l.active).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. lunch for 6 at site B" />
        </Field>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : "Save expense"}
        </Button>
      </div>
    </Modal>
  );
}
