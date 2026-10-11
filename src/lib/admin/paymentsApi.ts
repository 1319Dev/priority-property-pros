import type { DashboardSummary } from "./dashboardApi";
import { adminRpc } from "./adminRpc";
import { asRecord, asRecords, readBool, readCount, readText } from "./json";

export type PaymentRow = {
  paymentId: string;
  kind: string;
  amountCents: number;
  status: string;
  livemode: boolean;
  createdAt: string | null;
  fulfilledAt: string | null;
  needsRefund: boolean;
  refundReason: string | null;
  refundedCents: number;
  profileId: string | null;
  partyName: string;
  email: string | null;
  businessName: string | null;
  referenceNumber: number | null;
};

export type PaymentFilters = {
  query: string;
  kind: "" | "activation" | "connect";
  status: string;
  failedOnly: boolean;
  includeTest: boolean;
};

export type PaymentsSummary = {
  grossCents: number;
  refundedCents: number;
  netCents: number;
  failedCount: number;
  needsRefundCount: number;
  definition: string;
};

function rowFrom(record: Record<string, unknown>): PaymentRow | null {
  const paymentId = readText(record.payment_id);
  const amountCents = readCount(record.amount_cents);
  if (!paymentId || amountCents == null) return null;
  return {
    paymentId,
    kind: readText(record.kind) ?? "",
    amountCents,
    status: readText(record.status) ?? "",
    livemode: readBool(record.livemode),
    createdAt: readText(record.created_at),
    fulfilledAt: readText(record.fulfilled_at),
    needsRefund: readBool(record.needs_refund),
    refundReason: readText(record.refund_reason),
    refundedCents: readCount(record.refunded_cents) ?? 0,
    profileId: readText(record.profile_id),
    partyName: readText(record.party_name) ?? "Account",
    email: readText(record.email),
    businessName: readText(record.business_name),
    referenceNumber: readCount(record.reference_number),
  };
}

export function parsePaymentList(data: unknown): { rows: PaymentRow[]; total: number } {
  const record = asRecord(data);
  if (!record) throw new Error("Could not read payments.");
  const rows = asRecords(record.rows).flatMap((item) => {
    const row = rowFrom(item);
    return row ? [row] : [];
  });
  return { rows, total: readCount(record.total) ?? rows.length };
}

export function parsePaymentsSummary(data: unknown): PaymentsSummary {
  const record = asRecord(data);
  const grossCents = record ? readCount(record.gross_cents) : null;
  const netCents = record ? readCount(record.net_cents) : null;
  if (!record || grossCents == null || netCents == null) throw new Error("Could not read net revenue.");
  return {
    grossCents,
    refundedCents: readCount(record.refunded_cents) ?? 0,
    netCents,
    failedCount: readCount(record.failed_count) ?? 0,
    needsRefundCount: readCount(record.needs_refund_count) ?? 0,
    definition: readText(record.definition) ?? "",
  };
}

export function overlayNetRevenue(summary: DashboardSummary | null, money: PaymentsSummary): DashboardSummary | null {
  if (!summary) return summary;
  return {
    ...summary,
    metrics: {
      ...summary.metrics,
      revenue_net_cents: {
        value: money.netCents,
        status: "available",
        definition: money.definition,
      },
    },
  };
}

export async function fetchPayments(filters: PaymentFilters) {
  const data = await adminRpc(
    "admin_list_payments",
    {
      p_query: filters.query.trim() || null,
      p_kind: filters.kind || null,
      p_status: filters.failedOnly ? null : filters.status.trim() || null,
      p_failed: filters.failedOnly,
      p_include_test: filters.includeTest,
      p_limit: 50,
      p_offset: 0,
    },
    "Could not load payments.",
  );
  return parsePaymentList(data);
}

export async function fetchPaymentsSummary(includeTest: boolean) {
  const data = await adminRpc("admin_payments_summary", { p_include_test: includeTest }, "Could not load net revenue.");
  return parsePaymentsSummary(data);
}
