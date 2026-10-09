import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./config";
import type { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | null = null;
let recoveryRequestClient: TypedSupabaseClient | null = null;

export { isSupabaseConfigured };

export function getSupabaseClient(): TypedSupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

/**
 * Password-reset emails only. Implicit flow puts tokens in the URL hash, so the
 * link works in a browser that never stored the PKCE code verifier.
 * This client does not read the URL and does not touch the main session.
 */
export function getSupabaseRecoveryRequestClient(): TypedSupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!recoveryRequestClient) {
    recoveryRequestClient = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "ppp-recovery-request",
      },
    });
  }
  return recoveryRequestClient;
}

/** Test-only: replace the singleton (used by mocked suites). */
export function __setSupabaseClientForTests(next: TypedSupabaseClient | null): void {
  client = next;
}
