import { adminRpc } from "./adminRpc";
import { asRecord, asRecords, readBool, readCount, readText } from "./json";

export type ProjectRow = {
  projectId: string;
  referenceNumber: number | null;
  title: string;
  status: string;
  city: string | null;
  state: string | null;
  trade: string | null;
  customerName: string;
  contractorBusinessName: string | null;
  postedAt: string | null;
  disputed: boolean;
  bookingId: string | null;
};

export type ProjectDetail = ProjectRow & {
  description: string;
  customerId: string;
  history: Array<{ fromStatus: string | null; toStatus: string; createdAt: string | null }>;
  estimates: Array<{ estimateId: string; status: string; totalCents: number; contractorBusinessName: string }>;
  bookings: Array<{ bookingId: string; status: string; completedAt: string | null; disputedAt: string | null }>;
};

function rowFrom(record: Record<string, unknown>): ProjectRow | null {
  const projectId = readText(record.project_id);
  if (!projectId) return null;
  return {
    projectId,
    referenceNumber: readCount(record.reference_number),
    title: readText(record.title) ?? "Project",
    status: readText(record.status) ?? "",
    city: readText(record.city),
    state: readText(record.state),
    trade: readText(record.trade),
    customerName: readText(record.customer_name) ?? "Homeowner",
    contractorBusinessName: readText(record.contractor_business_name),
    postedAt: readText(record.posted_at),
    disputed: readBool(record.disputed),
    bookingId: readText(record.booking_id),
  };
}

export type ProjectFilters = {
  query: string;
  customer: string;
  contractor: string;
  status: string;
  city: string;
  trade: string;
  from: string;
  to: string;
  disputed: "" | "yes" | "no";
  includeTest: boolean;
};

export function parseProjectList(data: unknown): { rows: ProjectRow[]; total: number } {
  const record = asRecord(data);
  if (!record) throw new Error("Could not read projects.");
  const rows = asRecords(record.rows).flatMap((item) => {
    const row = rowFrom(item);
    return row ? [row] : [];
  });
  return { rows, total: readCount(record.total) ?? rows.length };
}

export function parseProjectDetail(data: unknown): ProjectDetail {
  const record = asRecord(data);
  const row = record ? rowFrom(record) : null;
  if (!record || !row) throw new Error("Could not read that project.");
  return {
    ...row,
    description: readText(record.description) ?? "",
    customerId: readText(record.customer_id) ?? "",
    history: asRecords(record.status_history).flatMap((item) => {
      const toStatus = readText(item.to_status);
      if (!toStatus) return [];
      return [{ fromStatus: readText(item.from_status), toStatus, createdAt: readText(item.created_at) }];
    }),
    estimates: asRecords(record.estimates).flatMap((item) => {
      const estimateId = readText(item.estimate_id);
      const totalCents = readCount(item.total_cents);
      if (!estimateId || totalCents == null) return [];
      return [
        {
          estimateId,
          status: readText(item.status) ?? "",
          totalCents,
          contractorBusinessName: readText(item.contractor_business_name) ?? "Contractor",
        },
      ];
    }),
    bookings: asRecords(record.bookings).flatMap((item) => {
      const bookingId = readText(item.booking_id);
      if (!bookingId) return [];
      return [
        {
          bookingId,
          status: readText(item.status) ?? "",
          completedAt: readText(item.completed_at),
          disputedAt: readText(item.disputed_at),
        },
      ];
    }),
  };
}

export async function fetchProjects(filters: ProjectFilters) {
  const data = await adminRpc(
    "admin_list_projects",
    {
      p_query: filters.query.trim() || null,
      p_customer: filters.customer.trim() || null,
      p_contractor: filters.contractor.trim() || null,
      p_status: filters.status || null,
      p_city: filters.city.trim() || null,
      p_trade: filters.trade.trim() || null,
      p_from: filters.from || null,
      p_to: filters.to || null,
      p_disputed: filters.disputed === "" ? null : filters.disputed === "yes",
      p_include_test: filters.includeTest,
      p_limit: 50,
      p_offset: 0,
    },
    "Could not load projects.",
  );
  return parseProjectList(data);
}

export async function fetchProject(projectId: string) {
  const data = await adminRpc("admin_get_project", { p_project_id: projectId }, "Could not load that project.");
  return parseProjectDetail(data);
}
