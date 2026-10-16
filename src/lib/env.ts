const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

export const isConfigured =
  url.startsWith("http") &&
  !url.includes("YOUR-PROJECT") &&
  anonKey.length > 20 &&
  !anonKey.includes("YOUR-ANON");
