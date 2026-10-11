import { SUPPORT_EMAIL } from "../../data/brand";
import { getSupabaseClient } from "../supabase/client";

/**
 * EMERGENCY PAUSE (2026-10-11, owner-approved). Self-serve deletion can leave
 * accounts half-deleted until PR #90 ships, so the Account page shows a
 * support-email notice instead of the Delete button. The delete-account edge
 * function also refuses with 503 account_deletion_paused. Set this to false
 * (with the fixed function from PR #90 deployed) to restore the old flow.
 */
export const ACCOUNT_DELETION_PAUSED = true;

export const ACCOUNT_DELETION_PAUSED_ERROR = "account_deletion_paused";

export const ACCOUNT_DELETION_REQUEST_SUBJECT = "Account deletion request";

export const ACCOUNT_DELETION_REQUEST_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  ACCOUNT_DELETION_REQUEST_SUBJECT,
)}`;

export const ACCOUNT_DELETION_PAUSED_MESSAGE = `Account deletion is temporarily handled by our support team. To request deletion, email ${SUPPORT_EMAIL} from the email on your account, and we will process it.`;

export const DELETE_ACCOUNT_CONFIRM_WORD = "DELETE";

export const DELETE_ACCOUNT_TITLE = "Delete this account?";

export const DELETE_ACCOUNT_BODY =
  "This permanently closes your Priority Property Pros account. Your profile, pro card, and saved projects are removed. You will be signed out. This cannot be undone.";

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

async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof (context as Response).clone !== "function") return null;
  try {
    return await (context as Response).clone().json();
  } catch {
    return null;
  }
}

export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured yet." };

  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: {},
  });

  if (error) {
    const body = data ?? (await readFunctionErrorBody(error));
    if (
      body &&
      typeof body === "object" &&
      (body as { error?: unknown }).error === ACCOUNT_DELETION_PAUSED_ERROR
    ) {
      return { error: ACCOUNT_DELETION_PAUSED_MESSAGE };
    }
    const message = functionsErrorMessage(
      data,
      error.message || "Could not delete your account. Try again, or contact support.",
    );
    if (/not signed in/i.test(message)) {
      return { error: "Sign in again, then try deleting your account." };
    }
    if (/last active admin/i.test(message)) {
      return { error: "This is the last admin account, so it cannot be deleted." };
    }
    return { error: message };
  }

  return { error: null };
}
