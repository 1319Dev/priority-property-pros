import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONNECTION_FEE_NO_HIRE_GUARANTEE, CONNECTION_FEE_NON_REFUNDABLE } from "../../data/pricing";
import { privateContactHintCopy, privateContactLockedCopy } from "./bookings";
import {
  CONNECT_CONFIRM_BODY,
  CONNECT_PAYMENTS_OFF_COPY,
  JOBS_STREET_HELPER_COPY,
  OPPORTUNITY_CONTACT_LOCKED_COPY,
  contractorConnectionUiState,
  showConnectButton,
} from "./connectionLifecycle";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

function uiSources(): string {
  const roots = [path.join(repoRoot, "src/pages"), path.join(repoRoot, "src/components")];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, name.name);
      if (name.isDirectory()) walk(next);
      else if (/\.(ts|tsx)$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) {
        files.push(readFileSync(next, "utf8"));
      }
    }
  };
  for (const root of roots) walk(root);
  return files.join("\n");
}

describe("connection checkout copy and payments-off fallback", () => {
  const sql = readdirSync(path.join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(repoRoot, "supabase/migrations", name), "utf8"))
    .join("\n\n");
  const request = functionBody(sql, "request_project_connection");
  const reserve = functionBody(sql, "reserve_connection_checkout");

  it("does not tell contractors that connection checkout is coming soon", () => {
    expect(CONNECT_PAYMENTS_OFF_COPY).toMatch(/\$4\.99 checkout is temporarily unavailable/);
    expect(CONNECT_PAYMENTS_OFF_COPY).toMatch(/contact stays locked/i);
    expect(CONNECT_PAYMENTS_OFF_COPY).toMatch(/clicking connect does not unlock contact/i);
    expect(CONNECT_PAYMENTS_OFF_COPY).not.toMatch(/coming soon/i);
    expect(JOBS_STREET_HELPER_COPY).toMatch(/Connect for \$4\.99/);
    expect(JOBS_STREET_HELPER_COPY).not.toMatch(/coming soon/i);
    expect(OPPORTUNITY_CONTACT_LOCKED_COPY).toMatch(/does not unlock contact/i);
    expect(OPPORTUNITY_CONTACT_LOCKED_COPY).not.toMatch(/payments are off|coming soon/i);
    expect(privateContactHintCopy()).toMatch(/\$4\.99 connection entitlement/i);
    expect(privateContactHintCopy()).not.toMatch(/coming soon/i);
    expect(privateContactLockedCopy()).not.toMatch(/payments are off|coming soon/i);
    expect(CONNECTION_FEE_NON_REFUNDABLE).toMatch(/non-refundable/i);
    expect(CONNECTION_FEE_NO_HIRE_GUARANTEE).toMatch(/does not guarantee a hire/i);
    expect(CONNECT_CONFIRM_BODY).toMatch(/does not guarantee a hire/i);
    expect(uiSources()).not.toMatch(/online payment setup is coming soon/i);
    expect(uiSources()).not.toMatch(/payments\s+coming\s+soon/i);
    expect(uiSources()).not.toMatch(/while payments are off/i);
  });

  it("offers $4.99 checkout for a payments-off row only when connection checkout is enabled", () => {
    expect(contractorConnectionUiState({ myConnectionStatus: "PAYMENT_DISABLED" })).toBe("requested");
    expect(contractorConnectionUiState({ myConnectionStatus: "PAYMENT_DISABLED", checkoutEnabled: false })).toBe(
      "requested",
    );
    expect(showConnectButton("requested")).toBe(false);
    expect(
      contractorConnectionUiState({
        myConnectionStatus: "PAYMENT_DISABLED",
        checkoutEnabled: true,
        remaining: 0,
      }),
    ).toBe("connect");
    expect(
      showConnectButton(
        contractorConnectionUiState({ myConnectionStatus: "PAYMENT_DISABLED", checkoutEnabled: true }),
      ),
    ).toBe(true);
    expect(
      contractorConnectionUiState({
        myConnectionStatus: "PAYMENT_DISABLED",
        checkoutEnabled: true,
        cancelled: true,
      }),
    ).toBe("requested");
    expect(
      contractorConnectionUiState({
        myConnectionStatus: "PAYMENT_DISABLED",
        checkoutEnabled: true,
        accepting: false,
      }),
    ).toBe("requested");
  });

  it("keeps the payments-off RPC as a fallback and resumes checkout without flipping payment flags", () => {
    expect(request).toMatch(/IF public\.connection_fee_checkout_enabled\(\) THEN/);
    expect(request).toMatch(/RAISE EXCEPTION 'connection fee checkout is required'/);
    expect(request).toMatch(/'PAYMENT_DISABLED'/);
    expect(request).toContain(CONNECT_PAYMENTS_OFF_COPY);
    expect(request).not.toMatch(/coming soon/i);
    expect(request).not.toMatch(/payments_live',\s*1/);
    expect(request).not.toMatch(/charges_live',\s*1/);
    expect(reserve).toMatch(/IF NOT public\.connection_fee_checkout_enabled\(\) THEN/);
    expect(reserve).toMatch(/existing\.status = 'PAYMENT_DISABLED'/);
    expect(reserve).toMatch(/fee_cents = 499/);
    expect(reserve).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(reserve).not.toMatch(/payments_live',\s*1/);
    expect(reserve).not.toMatch(/charges_live',\s*1/);
    expect(reserve).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(reserve).not.toMatch(/signup_fee_enabled',\s*1/);
  });
});
