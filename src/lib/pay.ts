import type { AttendanceStatus, Role, Worker } from "./types";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function effectiveDayRate(worker: Worker, role: Role | null): number {
  return num(worker.day_rate) ?? num(role?.day_rate) ?? 0;
}

export function effectiveMonthRate(worker: Worker, role: Role | null): number {
  return num(worker.month_rate) ?? num(role?.month_rate) ?? 0;
}

/**
 * Suggested pay for a single day.
 * - month mode: daily entries do not accrue daily pay (paid via the monthly rate)
 * - day mode: present = full day rate, half_day = 50%, absent = 0
 */
export function suggestDayPay(
  worker: Worker,
  role: Role | null,
  status: AttendanceStatus,
): number {
  if (status === "absent") return 0;
  if (worker.rate_mode === "month") return 0;
  const dayRate = effectiveDayRate(worker, role);
  return round2(status === "half_day" ? dayRate / 2 : dayRate);
}

/** Human-readable rate for a worker, e.g. "₹1,000/day" or "₹25,000/month". */
export function formatRate(worker: Worker, role: Role | null): string {
  if (worker.rate_mode === "month") {
    return `${formatINR(effectiveMonthRate(worker, role))}/month`;
  }
  return `${formatINR(effectiveDayRate(worker, role))}/day`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatINR(n: number): string {
  return "₹" + (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

/**
 * Supabase requires passwords of at least 6 characters, but people type short
 * 4-digit PINs. We left-pad with zeros so "2711" is stored/entered as "002711".
 */
export function padPin(pin: string): string {
  return pin.padStart(6, "0");
}
