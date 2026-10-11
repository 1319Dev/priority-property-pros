import { getSupabaseClient } from "../supabase/client";
import { LEGAL_DOCUMENTS, type LegalDocument } from "./catalog";

type MissingRow = { slug: string; title: string; version: number };

function asDocument(row: MissingRow): LegalDocument {
  const known = LEGAL_DOCUMENTS.find((doc) => doc.slug === row.slug);
  if (known) return { ...known, title: row.title, version: row.version };
  return {
    slug: row.slug,
    title: row.title,
    version: row.version,
    path: "/terms",
    audience: "ALL",
  };
}

/**
 * Current agreements this account has not accepted.
 * Returns null when the check cannot run (no client, or the migration is not applied).
 * A null result must not be treated as a lock.
 */
export async function fetchMissingAgreements(): Promise<LegalDocument[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("missing_current_agreements");
  if (error) return null;
  return ((data ?? []) as MissingRow[]).map(asDocument);
}

/** Records the server's current versions and timestamps for this signed-in account. */
export async function acceptCurrentAgreements(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured yet." };
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 180);
  const { error } = await supabase.rpc("accept_current_agreements", { p_user_agent: userAgent });
  return { error: error?.message ?? null };
}
