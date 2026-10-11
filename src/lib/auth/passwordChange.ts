import { getSupabaseClient, getSupabasePasswordCheckClient } from "../supabase/client";
import { MIN_PASSWORD_LENGTH } from "./passwordPolicy";

/**
 * Same 8-character rule as sign-up and reset (#99). The Supabase Auth dashboard
 * minimum is the real server enforcement; this keeps the Account form consistent.
 */
export const PASSWORD_CHANGE_MIN_LENGTH = MIN_PASSWORD_LENGTH;

export type PasswordChangeInput = {
  email: string | null | undefined;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type AuthFailure = { message?: string; code?: string; status?: number } | null;

export type PasswordChangeDeps = {
  verifyCurrent: (email: string, password: string) => Promise<{ error: AuthFailure }>;
  update: (newPassword: string, currentPassword: string) => Promise<{ error: AuthFailure }>;
};

export type PasswordChangeResult = { ok: true } | { ok: false; message: string; field?: "current" | "new" | "confirm" };

export function passwordChangeFormError(input: PasswordChangeInput): PasswordChangeResult | null {
  if (!input.currentPassword) return { ok: false, field: "current", message: "Enter your current password." };
  if (input.newPassword.length < PASSWORD_CHANGE_MIN_LENGTH) {
    return { ok: false, field: "new", message: `Use at least ${PASSWORD_CHANGE_MIN_LENGTH} characters.` };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, field: "new", message: "Pick a new password that is different from your current one." };
  }
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, field: "confirm", message: "The new passwords do not match." };
  }
  return null;
}

function isRateLimited(error: AuthFailure): boolean {
  return error?.status === 429 || /rate limit|too many/i.test(error?.message ?? "");
}

export function passwordUpdateMessage(error: AuthFailure): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (isRateLimited(error)) return "Too many tries. Wait a few minutes and try again.";
  if (code === "same_password" || /different from the old password/i.test(message)) {
    return "Pick a new password that is different from your current one.";
  }
  if (code === "weak_password" || /password should be/i.test(message)) {
    return `Use at least ${PASSWORD_CHANGE_MIN_LENGTH} characters.`;
  }
  if (code === "reauthentication_needed" || /reauthenticat/i.test(message)) {
    return "For your security, sign out and use Forgot password to set a new password by email.";
  }
  return "We couldn't change your password. Try again.";
}

/** Re-checks the current password, then sets the new one on the signed-in account. */
export async function changePassword(
  input: PasswordChangeInput,
  deps: PasswordChangeDeps = browserPasswordChangeDeps,
): Promise<PasswordChangeResult> {
  const invalid = passwordChangeFormError(input);
  if (invalid) return invalid;
  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, message: "We couldn't find the email on this account. Sign out and back in." };

  const verified = await deps.verifyCurrent(email, input.currentPassword).catch(() => ({
    error: { message: "network" } as AuthFailure,
  }));
  if (verified.error) {
    if (isRateLimited(verified.error)) return { ok: false, message: "Too many tries. Wait a few minutes and try again." };
    if (verified.error.message === "network") return { ok: false, message: "We couldn't check your password. Try again." };
    return { ok: false, field: "current", message: "Your current password is not right." };
  }

  const updated = await deps.update(input.newPassword, input.currentPassword).catch(() => ({
    error: { message: "network" } as AuthFailure,
  }));
  if (updated.error) return { ok: false, message: passwordUpdateMessage(updated.error) };
  return { ok: true };
}

export const browserPasswordChangeDeps: PasswordChangeDeps = {
  async verifyCurrent(email, password) {
    const checker = getSupabasePasswordCheckClient();
    if (!checker) return { error: { message: "network" } };
    const { error } = await checker.auth.signInWithPassword({ email, password });
    if (!error) await checker.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { error: error ? { message: error.message, code: error.code, status: error.status } : null };
  },
  async update(newPassword, currentPassword) {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: { message: "network" } };
    const { error } = await supabase.auth.updateUser({ password: newPassword, current_password: currentPassword });
    return { error: error ? { message: error.message, code: error.code, status: error.status } : null };
  },
};
