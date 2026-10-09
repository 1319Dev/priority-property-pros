import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

vi.mock("./config", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
  getSupabaseAnonKey: () => "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public",
  isSupabaseConfigured: () => true,
}));

import { getSupabaseClient, getSupabaseRecoveryRequestClient } from "./client";

describe("supabase clients", () => {
  it("keeps PKCE on the app client and uses implicit flow only to send reset email", () => {
    expect(getSupabaseClient()).not.toBeNull();
    expect(getSupabaseRecoveryRequestClient()).not.toBeNull();

    const options = vi.mocked(createClient).mock.calls.map((call) => call[2] as { auth?: Record<string, unknown> });
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          auth: expect.objectContaining({
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: "pkce",
          }),
        }),
        expect.objectContaining({
          auth: {
            flowType: "implicit",
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "ppp-recovery-request",
          },
        }),
      ]),
    );
  });
});
