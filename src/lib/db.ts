import { requireClient } from "./supabase";
import type { Attendance, AttendanceStatus } from "./types";

export interface AttendanceInput {
  worker_id: string;
  work_date: string;
  location_id: string | null;
  role_id: string | null;
  status: AttendanceStatus;
  hours: number | null;
  pay_amount: number;
  pay_overridden: boolean;
  note: string | null;
}

/** Insert or update the single attendance row for a worker+date. */
export async function saveAttendance(input: AttendanceInput): Promise<Attendance | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("attendance")
    .upsert(input, { onConflict: "worker_id,work_date" })
    .select("*")
    .single();
  if (error) throw error;
  return data as Attendance;
}

export async function deleteAttendance(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("attendance").delete().eq("id", id);
  if (error) throw error;
}

export async function insertRow<T extends Record<string, unknown>>(table: string, row: T) {
  const client = requireClient();
  const { error } = await client.from(table).insert(row);
  if (error) throw error;
}

export async function updateRow(table: string, id: string, patch: Record<string, unknown>) {
  const client = requireClient();
  const { error } = await client.from(table).update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeRow(table: string, id: string) {
  const client = requireClient();
  const { error } = await client.from(table).delete().eq("id", id);
  if (error) throw error;
}
