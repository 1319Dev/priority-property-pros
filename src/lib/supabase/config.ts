const PLACEHOLDER_URL = "YOUR-PROJECT-REF";
const PLACEHOLDER_KEY = "your-anon-public-key";

/** Production Supabase project ref — staging preview must never target this host. */
export const PRODUCTION_SUPABASE_REF = "bersftkjpbzpgtahbqwd";

/** Staging Supabase project ref required when VITE_APP_ENV=staging. */
export const STAGING_SUPABASE_REF = "giiskdvitimksdewnelc";

export function getAppEnv(value = import.meta.env.VITE_APP_ENV): string {
  return (value ?? "").trim().toLowerCase();
}

export function isStagingAppEnv(value = import.meta.env.VITE_APP_ENV): boolean {
  return getAppEnv(value) === "staging";
}

export function getSupabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

export function getSupabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

export function isConfiguredPair(url: string, key: string): boolean {
  if (!url || !key) return false;
  if (url.includes(PLACEHOLDER_URL)) return false;
  if (key.includes(PLACEHOLDER_KEY)) return false;
  return url.startsWith("https://") && key.length > 20;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Pure guard used by runtime init and tests. Returns an error message, or null if OK. */
export function stagingSupabaseGuardError(
  url: string,
  appEnv: string | undefined = import.meta.env.VITE_APP_ENV,
): string | null {
  if (!isStagingAppEnv(appEnv)) return null;
  const hostname = hostnameOf(url);
  if (!hostname) {
    return "Staging preview refused to start: VITE_SUPABASE_URL is missing or not a valid URL.";
  }
  if (hostname.includes(PRODUCTION_SUPABASE_REF)) {
    return `Staging preview refused to start: VITE_SUPABASE_URL points at production (${PRODUCTION_SUPABASE_REF}).`;
  }
  if (!hostname.includes(STAGING_SUPABASE_REF)) {
    return `Staging preview refused to start: VITE_SUPABASE_URL must use staging project ${STAGING_SUPABASE_REF}.`;
  }
  return null;
}

export function assertStagingSupabaseTarget(
  url = getSupabaseUrl(),
  appEnv = import.meta.env.VITE_APP_ENV,
): void {
  const message = stagingSupabaseGuardError(url, appEnv);
  if (message) throw new Error(message);
}

export function isSupabaseConfigured(): boolean {
  assertStagingSupabaseTarget();
  return isConfiguredPair(getSupabaseUrl(), getSupabaseAnonKey());
}
