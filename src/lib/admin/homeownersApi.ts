import { adminRpc } from "./adminRpc";
import { asRecord, asRecords, readBool, readCount, readText } from "./json";

export type HomeownerRow = {
  profileId: string;
  displayName: string;
  email: string;
  accountStatus: string;
  signupFeeStatus: string;
  projectCount: number;
  flag: string | null;
  flagNote: string | null;
  createdAt: string | null;
};

export type HomeownerProject = {
  projectId: string;
  referenceNumber: number | null;
  title: string;
  status: string;
  city: string | null;
  postedAt: string | null;
};

export type HomeownerPayment = {
  chargeId: string;
  kind: string;
  amountCents: number;
  status: string;
  livemode: boolean;
  createdAt: string | null;
  fulfilledAt: string | null;
  needsRefund: boolean;
  refundReason: string | null;
};

export type HomeownerDetail = HomeownerRow & {
  projects: HomeownerProject[];
  payments: HomeownerPayment[];
};

export type HomeownerList = {
  rows: HomeownerRow[];
  total: number;
};

const LIST_KEYS = [
  "profile_id",
  "display_name",
  "email",
  "account_status",
  "signup_fee_status",
  "project_count",
  "flag",
  "flag_note",
  "created_at",
] as const;

function rowFrom(record: Record<string, unknown>): HomeownerRow | null {
  const profileId = readText(record.profile_id);
  const email = readText(record.email);
  if (!profileId || !email) return null;
  return {
    profileId,
    displayName: readText(record.display_name) ?? "Homeowner",
    email,
    accountStatus: readText(record.account_status) ?? "ACTIVE",
    signupFeeStatus: readText(record.signup_fee_status) ?? "UNPAID",
    projectCount: readCount(record.project_count) ?? 0,
    flag: readText(record.flag),
    flagNote: readText(record.flag_note),
    createdAt: readText(record.created_at),
  };
}

export function parseHomeownerList(data: unknown): HomeownerList {
  const record = asRecord(data);
  if (!record) throw new Error("Could not read homeowners.");
  const rows = asRecords(record.rows).flatMap((item) => {
    const row = rowFrom(item);
    return row ? [row] : [];
  });
  return { rows, total: readCount(record.total) ?? rows.length };
}

export function parseHomeownerDetail(data: unknown): HomeownerDetail {
  const record = asRecord(data);
  const row = record ? rowFrom(record) : null;
  if (!record || !row) throw new Error("Could not read that homeowner.");
  const projects = asRecords(record.projects).flatMap((item) => {
    const projectId = readText(item.project_id);
    if (!projectId) return [];
    return [
      {
        projectId,
        referenceNumber: readCount(item.reference_number),
        title: readText(item.title) ?? "Project",
        status: readText(item.status) ?? "",
        city: readText(item.city),
        postedAt: readText(item.posted_at),
      },
    ];
  });
  const payments = asRecords(record.payments).flatMap((item) => {
    const chargeId = readText(item.charge_id);
    const amountCents = readCount(item.amount_cents);
    if (!chargeId || amountCents == null) return [];
    return [
      {
        chargeId,
        kind: readText(item.kind) ?? "activation",
        amountCents,
        status: readText(item.status) ?? "",
        livemode: readBool(item.livemode),
        createdAt: readText(item.created_at),
        fulfilledAt: readText(item.fulfilled_at),
        needsRefund: readBool(item.needs_refund),
        refundReason: readText(item.refund_reason),
      },
    ];
  });
  return { ...row, projects, payments };
}

export function homeownerListKeys(): readonly string[] {
  return LIST_KEYS;
}

export async function fetchHomeowners(input: {
  query: string;
  status: string;
  includeTest: boolean;
}): Promise<HomeownerList> {
  const data = await adminRpc(
    "admin_list_homeowners",
    {
      p_query: input.query.trim() || null,
      p_status: input.status || null,
      p_include_test: input.includeTest,
      p_limit: 50,
      p_offset: 0,
    },
    "Could not load homeowners.",
  );
  return parseHomeownerList(data);
}

export async function fetchHomeowner(profileId: string, includeTest: boolean): Promise<HomeownerDetail> {
  const data = await adminRpc(
    "admin_get_homeowner",
    { p_profile_id: profileId, p_include_test: includeTest },
    "Could not load that homeowner.",
  );
  return parseHomeownerDetail(data);
}
