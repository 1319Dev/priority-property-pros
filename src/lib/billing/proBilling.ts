import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase/client";
import { formatProjectReference } from "../marketplace/projectReference";
import type { AccountType } from "../auth/types";
import type { SignupFeeStatus } from "../signupFee/constants";

/**
 * Contractor billing history: $4.99 Connect payments and the $9.99 activation.
 * Read-only. Uses the existing own-row RLS on project_connections,
 * connection_checkout_sessions, signup_fee_charges, and projects (reference
 * number only). No customer name, phone, email, street, or project title.
 * PPP does not store Stripe receipt URLs, so no receipt link is shown.
 * Checkouts that were started but never charged are left out.
 */

export type BillingRowKind = "connect" | "activation";

export type BillingRow = {
  id: string;
  kind: BillingRowKind;
  label: string;
  date: string | null;
  jobRef: string | null;
  amountCents: number;
  status: string;
  charged: boolean;
  testMode: boolean;
};

type ConnectionRow = {
  id: string;
  project_id: string | null;
  status: string | null;
  fee_cents: number | null;
  paid_at: string | null;
  created_at: string | null;
  cancelled_at: string | null;
  needs_refund: boolean | null;
};

type ConnectSessionRow = {
  connection_id: string | null;
  amount_cents: number | null;
  livemode: boolean | null;
  status: string | null;
  payment_status: string | null;
};

type SignupChargeRow = {
  id: string;
  amount_cents: number | null;
  status: string | null;
  payment_status: string | null;
  livemode: boolean | null;
  fulfilled_at: string | null;
  created_at: string | null;
  needs_refund: boolean | null;
};

export const CONNECT_FEE_CENTS = 499;
export const ACTIVATION_FEE_CENTS = 999;

export function connectStatusLabel(row: Pick<ConnectionRow, "status" | "paid_at" | "needs_refund">): { status: string; charged: boolean } {
  const paid = Boolean(row.paid_at) || row.status === "PAID" || row.status === "COMPLETED";
  if (paid && row.needs_refund) return { status: "Paid · refund under review", charged: true };
  if (paid) return { status: row.status === "COMPLETED" ? "Paid · job completed" : "Paid", charged: true };
  switch (row.status) {
    case "INITIATED":
    case "RESERVED":
      return { status: "Checkout started · not charged", charged: false };
    case "PAYMENT_DISABLED":
      return { status: "Not charged · payments were off", charged: false };
    case "FAILED":
      return { status: "Payment failed · not charged", charged: false };
    case "EXPIRED":
      return { status: "Expired · not charged", charged: false };
    case "CANCELLED":
      return { status: "Cancelled · not charged", charged: false };
    default:
      return { status: "Not charged", charged: false };
  }
}

export function activationChargeStatusLabel(row: Pick<SignupChargeRow, "status" | "payment_status" | "needs_refund">): { status: string; charged: boolean } {
  const paid = row.status === "PAID" || row.status === "CONSUMED" || row.payment_status === "paid";
  if (paid && (row.needs_refund || row.status === "NEEDS_REFUND")) return { status: "Paid · refund under review", charged: true };
  if (paid) return { status: "Paid", charged: true };
  switch (row.status) {
    case "OPEN":
      return { status: "Checkout started · not charged", charged: false };
    case "FAILED":
      return { status: "Payment failed · not charged", charged: false };
    case "EXPIRED":
      return { status: "Expired · not charged", charged: false };
    case "CANCELED":
      return { status: "Cancelled · not charged", charged: false };
    case "NEEDS_REFUND":
      return { status: "Refund under review", charged: true };
    default:
      return { status: "Not charged", charged: false };
  }
}

export function buildBillingRows(input: {
  connections: ConnectionRow[];
  sessions: ConnectSessionRow[];
  charges: SignupChargeRow[];
  references: Record<string, number | null | undefined>;
}): BillingRow[] {
  const sessionByConnection = new Map<string, ConnectSessionRow>();
  for (const session of input.sessions) {
    if (!session.connection_id) continue;
    const prior = sessionByConnection.get(session.connection_id);
    // Prefer a paid session when there are several attempts.
    if (!prior || session.payment_status === "paid") sessionByConnection.set(session.connection_id, session);
  }
  const rows: BillingRow[] = [];
  for (const connection of input.connections) {
    const session = sessionByConnection.get(connection.id);
    const label = connectStatusLabel(connection);
    rows.push({
      id: `connect-${connection.id}`,
      kind: "connect",
      label: "Connect",
      date: connection.paid_at ?? connection.cancelled_at ?? connection.created_at,
      jobRef: connection.project_id ? formatProjectReference(input.references[connection.project_id] ?? null) : null,
      amountCents: session?.amount_cents ?? connection.fee_cents ?? CONNECT_FEE_CENTS,
      status: label.status,
      charged: label.charged,
      testMode: session?.livemode === false,
    });
  }
  for (const charge of input.charges) {
    const label = activationChargeStatusLabel(charge);
    rows.push({
      id: `activation-${charge.id}`,
      kind: "activation",
      label: "Account activation",
      date: charge.fulfilled_at ?? charge.created_at,
      jobRef: null,
      amountCents: charge.amount_cents ?? ACTIVATION_FEE_CENTS,
      status: label.status,
      charged: label.charged,
      testMode: charge.livemode === false,
    });
  }
  // Only real money movements are billing history: paid, refunded, or under refund review.
  // An abandoned, open, expired, cancelled, or failed checkout never charged the card, so it is not listed.
  return rows.filter((row) => row.charged).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function billingTotalChargedCents(rows: BillingRow[]): number {
  return rows.filter((row) => row.charged && !row.testMode).reduce((sum, row) => sum + row.amountCents, 0);
}

/** The Account page line. A fulfilled $9.99 charge wins over the profile flag. */
export function accountActivationText(input: {
  accountType: AccountType | null | undefined;
  status: SignupFeeStatus | null | undefined;
  paidAt: string | null | undefined;
  paidChargeAt?: string | null;
}): { text: string; showActivate: boolean } {
  if (input.paidChargeAt) {
    return { text: `Paid $9.99 on ${formatBillingDate(input.paidChargeAt)}`, showActivate: false };
  }
  if (input.status === "PAID") {
    return { text: input.paidAt ? `Paid $9.99 on ${formatBillingDate(input.paidAt)}` : "Paid $9.99", showActivate: false };
  }
  if (input.status === "UNPAID") return { text: "Not activated · $9.99 due", showActivate: true };
  if (input.accountType === "CUSTOMER" || input.accountType === "CONTRACTOR") {
    return { text: "Waived · no $9.99 activation charge on this account", showActivate: false };
  }
  return { text: "Not required for this role", showActivate: false };
}

export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "Date not on file";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date not on file";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

function db(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured yet.");
  // These tables are not in the generated types yet; reads still go through RLS.
  return client as unknown as SupabaseClient;
}

export async function fetchMyPaidActivationAt(profileId: string): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await (client as unknown as SupabaseClient)
    .from("signup_fee_charges")
    .select("status, payment_status, fulfilled_at, created_at, livemode")
    .eq("profile_id", profileId);
  if (error) return null;
  const paid = ((data ?? []) as Array<SignupChargeRow>).filter(
    (row) => row.livemode !== false && activationChargeStatusLabel(row).charged,
  );
  if (paid.length === 0) return null;
  return paid.map((row) => row.fulfilled_at ?? row.created_at ?? "").sort().reverse()[0] || null;
}

export async function fetchProBillingRows(input: { profileId: string; contractorProfileId: string }): Promise<BillingRow[]> {
  const client = db();
  const [connections, sessions, charges] = await Promise.all([
    client
      .from("project_connections")
      .select("id, project_id, status, fee_cents, paid_at, created_at, cancelled_at, needs_refund")
      .eq("contractor_profile_id", input.contractorProfileId),
    client
      .from("connection_checkout_sessions")
      .select("connection_id, amount_cents, livemode, status, payment_status")
      .eq("contractor_profile_id", input.contractorProfileId),
    client
      .from("signup_fee_charges")
      .select("id, amount_cents, status, payment_status, livemode, fulfilled_at, created_at, needs_refund")
      .eq("profile_id", input.profileId),
  ]);
  if (connections.error) throw new Error("Could not load your Connect payments.");
  if (charges.error) throw new Error("Could not load your activation payment.");
  const connectionRows = (connections.data ?? []) as ConnectionRow[];
  const projectIds = [...new Set(connectionRows.map((row) => row.project_id).filter((id): id is string => Boolean(id)))];
  const references: Record<string, number | null> = {};
  if (projectIds.length > 0) {
    // Reference numbers only. A project the contractor can no longer read shows no reference.
    const { data } = await client.from("projects").select("id, reference_number").in("id", projectIds);
    for (const row of (data ?? []) as Array<{ id: string; reference_number: number | null }>) {
      references[row.id] = row.reference_number;
    }
  }
  return buildBillingRows({
    connections: connectionRows,
    sessions: sessions.error ? [] : ((sessions.data ?? []) as ConnectSessionRow[]),
    charges: (charges.data ?? []) as SignupChargeRow[],
    references,
  });
}
