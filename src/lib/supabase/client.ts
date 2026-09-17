import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertStagingSupabaseTarget,
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./config";
import type { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | null = null;

export { isSupabaseConfigured };

export function getSupabaseClient(): TypedSupabaseClient | null {
  assertStagingSupabaseTarget();
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

/** Test-only: replace the singleton (used by mocked suites). */
export function __setSupabaseClientForTests(next: TypedSupabaseClient | null): void {
  client = next;
}
