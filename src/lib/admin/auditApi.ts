import { friendlyAdminError } from "./friendlyAdminError";
import { getSupabaseClient } from "../supabase/client";

const ROLES = new Set(["ADMIN", "CUSTOMER", "CONTRACTOR", "VERIFIER", "SYSTEM"]);

export type AuditLogRow = {
  occurredAt: string;
  actorRole: string;
  action: string;
  jobReference: string | null;
  summary: string | null;
};

export type AuditLogFilters = {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  reference?: string;
};

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

/** Drop a summary that looks like contact, a path, or a web address. */
export function safeAuditSummary(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (/@|https?:|\\|\/|\d{3}[-.\s]\d{3}/.test(text)) return null;
  return text;
}

function asRows(value: unknown): AuditLogRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    if (typeof item.occurred_at !== "string" || typeof item.action !== "string") return [];
    const actorRole = typeof item.actor_role === "string" ? item.actor_role : "";
    if (!ROLES.has(actorRole)) return [];
    const reference = typeof item.job_reference === "string" ? item.job_reference : null;
    return [
      {
        occurredAt: item.occurred_at,
        actorRole,
        action: item.action,
        jobReference: reference && /^PPP-\d+$/.test(reference) ? reference : null,
        summary: safeAuditSummary(typeof item.summary === "string" ? item.summary : null),
      },
    ];
  });
}

export async function listAdminAuditLog(filters: AuditLogFilters = {}): Promise<AuditLogRow[]> {
  const { data, error } = await client().rpc("admin_list_audit_log", {
    p_actor: filters.actor?.trim() || null,
    p_action: filters.action?.trim() || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_reference: filters.reference?.trim() || null,
    p_limit: 50,
  });
  if (error) throw new Error(friendlyAdminError(error, "Could not load the audit log."));
  return asRows(data);
}
