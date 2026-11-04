import { Modal } from "./ui";

const ROWS: { term: string; text: string }[] = [
  {
    term: "Gross wages",
    text: "What the workers earned in this period. Day worker: day rate × days present, with a half day at 50%. A monthly salary is spread across the days of the month.",
  },
  {
    term: "Net payable",
    text: "Gross wages minus advances and deductions, plus bonuses. This is what is still left to pay — it is not the total cost of the week.",
  },
  {
    term: "Advances + deductions",
    text: "Cash already paid to workers (advance) or withheld (deduction) in the period. Bonuses add back. These are part of gross, not an extra cost.",
  },
  {
    term: "Bata (site cash)",
    text: "Cash supervisors spent on site: lunch, travel, material and other. It is separate from wages. Granted = cash handed over; spent = recorded expenses; balance = granted − spent.",
  },
  {
    term: "On site",
    text: "Workers marked present plus half-day workers. Absent workers are shown separately.",
  },
  {
    term: "Worker-days",
    text: "One worker present for one day. Five people for seven days = 35 worker-days. This is the fairest way to compare weeks with different headcount.",
  },
  {
    term: "Rate",
    text: "A worker uses their role’s base rate (e.g. Plumber ₹1,000/day) unless you enter a custom rate for that person. Changing the role rate updates everyone without a custom rate.",
  },
  {
    term: "Budget baseline",
    text: "The average of complete weeks. It is provisional until at least four complete weeks are recorded, and it excludes the current week.",
  },
];

export function LegendModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="What the numbers mean" onClose={onClose}>
      <div className="space-y-3">
        {ROWS.map((r) => (
          <div key={r.term} className="rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{r.term}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{r.text}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function LegendLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 active:opacity-70"
    >
      What do these numbers mean?
    </button>
  );
}
