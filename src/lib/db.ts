import { requireClient } from "./supabase";
import type {
  Attendance,
  AttendanceStatus,
  LoginEntry,
  Profile,
  PublicWorker,
} from "./types";

export interface AttendanceInput {
  worker_id: string;
  work_date: string;
  location_id: string | null;
  role_id: string | null;
  status: AttendanceStatus;
  hours: number | null;
  note: string | null;
  marked_by: string | null;
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

/* ------------------------------------------------------------------ */
/* Auth / enrollment                                                   */
/* ------------------------------------------------------------------ */

export async function fetchLoginDirectory(): Promise<LoginEntry[]> {
  const client = requireClient();
  const { data, error } = await client.rpc("login_directory");
  if (error) throw error;
  return (data ?? []) as LoginEntry[];
}

export async function requestAccess(profileId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("request_access", { p_profile_id: profileId });
  if (error) throw error;
}

export async function approveAccess(profileId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("approve_access", { p_profile_id: profileId });
  if (error) throw error;
}

export async function rejectAccess(profileId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("reject_access", { p_profile_id: profileId });
  if (error) throw error;
}

export async function fetchPublicWorkers(): Promise<PublicWorker[]> {
  const client = requireClient();
  const { data, error } = await client.rpc("public_workers");
  if (error) throw error;
  return (data ?? []) as PublicWorker[];
}

/** Read the signed-in user's own profile row (allowed by `profiles_self_read`). */
export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

/**
 * Claim an approved supervisor profile: creates the auth user with the chosen
 * PIN and links it. Runs on the `enroll` Edge Function (service role).
 */
export async function enroll(profileId: string, pin: string): Promise<{ email: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("enroll", {
    body: { profile_id: profileId, pin },
  });
  if (error) throw error;
  const payload = data as { ok?: boolean; email?: string; error?: string } | null;
  if (!payload || payload.ok !== true || !payload.email) {
    throw new Error(payload?.error ?? "Enrollment failed");
  }
  return { email: payload.email };
}
