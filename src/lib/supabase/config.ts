const PLACEHOLDER_URL = "YOUR-PROJECT-REF";
const PLACEHOLDER_KEY = "your-anon-public-key";

export function getSupabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

export function getSupabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return false;
  if (url.includes(PLACEHOLDER_URL)) return false;
  if (key.includes(PLACEHOLDER_KEY)) return false;
  return url.startsWith("https://") && key.length > 20;
}
