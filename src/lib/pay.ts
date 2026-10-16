import type { AttendanceStatus, Role, Worker } from "./types";

export const DEFAULT_STANDARD_HOURS = 8;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function effectiveDayRate(worker: Worker, role: Role | null): number {
  return num(worker.day_rate) ?? num(role?.day_rate) ?? 0;
}

export function effectiveHourRate(worker: Worker, role: Role | null): number {
  return num(worker.hour_rate) ?? num(role?.hour_rate) ?? 0;
}

/**
 * Suggested pay for an attendance entry.
 * - hour mode: hours * hour rate
 * - day mode: present = full day rate, half_day = 50%
 * - absent: 0
 * Returns a rounded value; the UI lets the user override it.
 */
export function suggestPay(
  worker: Worker,
  role: Role | null,
  status: AttendanceStatus,
  hours: number | null,
): number {
  if (status === "absent") return 0;

  if (worker.rate_mode === "hour") {
    const h = num(hours) ?? (status === "half_day" ? DEFAULT_STANDARD_HOURS / 2 : DEFAULT_STANDARD_HOURS);
    return round2(h * effectiveHourRate(worker, role));
  }

  const dayRate = effectiveDayRate(worker, role);
  return round2(status === "half_day" ? dayRate / 2 : dayRate);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatINR(n: number): string {
  return "₹" + (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}
