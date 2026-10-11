import { adminRpc } from "./adminRpc";
import { asRecord, asRecords, readBool, readCount, readText } from "./json";

export type ContractorRow = {
  contractorProfileId: string;
  profileId: string;
  businessName: string;
  trades: string[];
  area: string | null;
  approvalStatus: string;
  accountStatus: string;
  signupFeeStatus: string;
  rating: number | null;
  reviewCount: number;
  jobCount: number;
  estimateCount: number;
  flag: string | null;
};

export type ContractorJob = {
  bookingId: string;
  projectId: string;
  referenceNumber: number | null;
  title: string;
  status: string;
};

export type ContractorEstimate = {
  estimateId: string;
  projectId: string;
  referenceNumber: number | null;
  title: string;
  status: string;
  totalCents: number;
};

export type ContractorPayment = {
  paymentId: string;
  kind: string;
  amountCents: number;
  status: string;
  livemode: boolean;
  needsRefund: boolean;
  refundReason: string | null;
  referenceNumber: number | null;
};

export type ContractorDetail = {
  contractorProfileId: string;
  profileId: string;
  businessName: string;
  email: string;
  trades: string[];
  area: string | null;
  approvalStatus: string;
  accountStatus: string;
  signupFeeStatus: string;
  rating: number | null;
  reviewCount: number;
  flag: string | null;
  flagNote: string | null;
  jobs: ContractorJob[];
  estimates: ContractorEstimate[];
  payments: ContractorPayment[];
};

function readDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function tradesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item] : []));
}

function rowFrom(record: Record<string, unknown>): ContractorRow | null {
  const contractorProfileId = readText(record.contractor_profile_id);
  const profileId = readText(record.profile_id);
  if (!contractorProfileId || !profileId) return null;
  return {
    contractorProfileId,
    profileId,
    businessName: readText(record.business_name) ?? "Contractor",
    trades: tradesFrom(record.trades),
    area: readText(record.area),
    approvalStatus: readText(record.approval_status) ?? "",
    accountStatus: readText(record.account_status) ?? "",
    signupFeeStatus: readText(record.signup_fee_status) ?? "",
    rating: readDecimal(record.rating),
    reviewCount: readCount(record.review_count) ?? 0,
    jobCount: readCount(record.job_count) ?? 0,
    estimateCount: readCount(record.estimate_count) ?? 0,
    flag: readText(record.flag),
  };
}

export function parseContractorList(data: unknown): { rows: ContractorRow[]; total: number } {
  const record = asRecord(data);
  if (!record) throw new Error("Could not read contractors.");
  const rows = asRecords(record.rows).flatMap((item) => {
    const row = rowFrom(item);
    return row ? [row] : [];
  });
  return { rows, total: readCount(record.total) ?? rows.length };
}

export function parseContractorDetail(data: unknown): ContractorDetail {
  const record = asRecord(data);
  const row = record ? rowFrom(record) : null;
  const email = record ? readText(record.email) : null;
  if (!record || !row || !email) throw new Error("Could not read that contractor.");
  return {
    ...row,
    email,
    flagNote: readText(record.flag_note),
    jobs: asRecords(record.jobs).flatMap((item) => {
      const bookingId = readText(item.booking_id);
      const projectId = readText(item.project_id);
      if (!bookingId || !projectId) return [];
      return [
        {
          bookingId,
          projectId,
          referenceNumber: readCount(item.reference_number),
          title: readText(item.title) ?? "Job",
          status: readText(item.status) ?? "",
        },
      ];
    }),
    estimates: asRecords(record.estimates).flatMap((item) => {
      const estimateId = readText(item.estimate_id);
      const totalCents = readCount(item.total_cents);
      if (!estimateId || totalCents == null) return [];
      return [
        {
          estimateId,
          projectId: readText(item.project_id) ?? "",
          referenceNumber: readCount(item.reference_number),
          title: readText(item.title) ?? "Estimate",
          status: readText(item.status) ?? "",
          totalCents,
        },
      ];
    }),
    payments: asRecords(record.payments).flatMap((item) => {
      const paymentId = readText(item.payment_id);
      const amountCents = readCount(item.amount_cents);
      if (!paymentId || amountCents == null) return [];
      return [
        {
          paymentId,
          kind: readText(item.kind) ?? "",
          amountCents,
          status: readText(item.status) ?? "",
          livemode: readBool(item.livemode),
          needsRefund: readBool(item.needs_refund),
          refundReason: readText(item.refund_reason),
          referenceNumber: readCount(item.reference_number),
        },
      ];
    }),
  };
}

export async function fetchContractors(input: { query: string; status: string; includeTest: boolean }) {
  const data = await adminRpc(
    "admin_list_contractors",
    {
      p_query: input.query.trim() || null,
      p_status: input.status || null,
      p_include_test: input.includeTest,
      p_limit: 50,
      p_offset: 0,
    },
    "Could not load contractors.",
  );
  return parseContractorList(data);
}

export async function fetchContractor(contractorProfileId: string, includeTest: boolean) {
  const data = await adminRpc(
    "admin_get_contractor",
    { p_contractor_profile_id: contractorProfileId, p_include_test: includeTest },
    "Could not load that contractor.",
  );
  return parseContractorDetail(data);
}
