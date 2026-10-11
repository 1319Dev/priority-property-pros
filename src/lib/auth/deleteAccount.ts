import { getSupabaseClient } from "../supabase/client";

export const DELETE_ACCOUNT_CONFIRM_WORD = "DELETE";

export const DELETE_ACCOUNT_TITLE = "Delete this account?";

export const DELETE_ACCOUNT_BODY =
  "Enter your password and type DELETE to confirm. Open jobs, an open dispute, or an unfinished refund stop the deletion and tell you why. An unpublished draft with no one else on it is removed. Every other project stays, without your name or street address. Payment, refund, dispute, and audit records stay. Other people's reviews, messages, and projects stay. This cannot be undone.";

export const DELETE_ACCOUNT_ACTIVE_JOBS_ERROR =
  "Finish or cancel your active jobs before deleting this account.";

export const DELETE_ACCOUNT_DISPUTE_ERROR =
  "Resolve the open dispute before deleting this account.";

export const DELETE_ACCOUNT_REFUND_ERROR =
  "Wait until the outstanding refund is finished before deleting this account.";

export const DELETE_ACCOUNT_PASSWORD_ERROR =
  "Enter your current password to delete this account.";

export const DELETE_ACCOUNT_GENERIC_ERROR =
  "We couldn't delete this account. Nothing was changed and nothing was charged. If this keeps happening, contact support.";

export const DELETE_ACCOUNT_INCOMPLETE_ERROR =
  "We couldn't delete this account. Nothing was changed and nothing was charged. Contact support.";

export const DELETE_ACCOUNT_DELETING_STATUS = "Deleting this account…";

export const DELETE_ACCOUNT_DELETED_STATUS =
  "This account is deleted. Payment, refund, and dispute records stay on file. Other people's reviews and messages stay.";

export function friendlyDeleteAccountError(raw: string | null | undefined): string {
  const text = unwrapDeleteAccountError(raw);
  if (/not signed in/i.test(text)) return "Sign in again, then try deleting your account.";
  if (/last active admin/i.test(text)) return "This is the last admin account, so it cannot be deleted.";
  if (/open dispute before deleting/i.test(text)) return DELETE_ACCOUNT_DISPUTE_ERROR;
  if (/outstanding refund/i.test(text)) return DELETE_ACCOUNT_REFUND_ERROR;
  if (/active jobs before deleting/i.test(text)) return DELETE_ACCOUNT_ACTIVE_JOBS_ERROR;
  if (/current password/i.test(text)) return DELETE_ACCOUNT_PASSWORD_ERROR;
  if (/could not close the auth user/i.test(text)) return DELETE_ACCOUNT_INCOMPLETE_ERROR;
  if (/you can only delete your own account/i.test(text)) return "You can only delete your own account.";
  if (/nothing was changed/i.test(text)) return DELETE_ACCOUNT_INCOMPLETE_ERROR;
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

export function deleteAccountConfirmEnabled(typed: string, password: string): boolean {
  return typed.trim() === DELETE_ACCOUNT_CONFIRM_WORD && password.trim().length > 0;
}

function functionsErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

export async function deleteOwnAccount(password: string): Promise<{ error: string | null; deleted: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured yet.", deleted: false };

  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { password },
  });

  if (error) {
    const message = functionsErrorMessage(data, error.message || "");
    return { error: friendlyDeleteAccountError(message), deleted: false };
  }

  const deleted = Boolean(data && typeof data === "object" && (data as { deleted?: unknown }).deleted === true);
  if (!deleted) {
    return { error: DELETE_ACCOUNT_GENERIC_ERROR, deleted: false };
  }
  return { error: null, deleted: true };
}
