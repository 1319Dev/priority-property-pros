import { getSupabaseClient } from "../supabase/client";

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

export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured yet." };

  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: {},
  });

  if (error) {
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
