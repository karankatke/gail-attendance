import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "./env";

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "attendance-auth",
      },
    })
  : null;

export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not configured. See README.md");
  return supabase;
}
