import { getSupabaseClient } from "../supabase/client";

export const DELETE_ACCOUNT_CONFIRM_WORD = "DELETE";

export const DELETE_ACCOUNT_TITLE = "Delete this account?";

export const DELETE_ACCOUNT_BODY =
  "This closes your Priority Property Pros account and signs you out. Your name and contact details are removed. The other person's jobs and payment records stay, without your contact details. Finish or cancel in-progress jobs before you delete. This cannot be undone.";

export const DELETE_ACCOUNT_ACTIVE_JOBS_ERROR =
  "Finish or cancel your active jobs before deleting this account.";

export const DELETE_ACCOUNT_GENERIC_ERROR =
  "We couldn't delete this account. Nothing was charged. If this keeps happening, contact support.";

export const DELETE_ACCOUNT_INCOMPLETE_ERROR =
  "We couldn't finish closing this account. Nothing was charged. Contact support.";

export function friendlyDeleteAccountError(raw: string | null | undefined): string {
  const text = unwrapDeleteAccountError(raw);
  if (/not signed in/i.test(text)) return "Sign in again, then try deleting your account.";
  if (/last active admin/i.test(text)) return "This is the last admin account, so it cannot be deleted.";
  if (/active jobs before deleting/i.test(text)) return DELETE_ACCOUNT_ACTIVE_JOBS_ERROR;
  if (/you can only delete your own account/i.test(text)) return "You can only delete your own account.";
  if (/could not finish closing/i.test(text)) return DELETE_ACCOUNT_INCOMPLETE_ERROR;
  return DELETE_ACCOUNT_GENERIC_ERROR;
}

function unwrapDeleteAccountError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    const match = text.match(/"message"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  }
  return text;
}

export const DELETE_ACCOUNT_CONFIRM_HINT = `Type ${DELETE_ACCOUNT_CONFIRM_WORD} to confirm.`;

export function deleteAccountConfirmEnabled(typed: string): boolean {
  return typed.trim() === DELETE_ACCOUNT_CONFIRM_WORD;
}

function functionsErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured yet." };

  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: {},
  });

  if (error) {
    const message = functionsErrorMessage(data, error.message || "");
    return { error: friendlyDeleteAccountError(message) };
  }

  return { error: null };
}
