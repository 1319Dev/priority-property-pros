export const EMAIL_CHANGE_SENT_MESSAGE =
  "Check both inboxes. Your email stays the same until both addresses confirm the change.";

export const EMAIL_CHANGE_PASSWORD_MESSAGE = "The current password is incorrect.";
export const EMAIL_CHANGE_RATE_LIMIT_MESSAGE = "Too many attempts. Wait a few minutes, then try again.";
export const EMAIL_CHANGE_NETWORK_MESSAGE =
  "We couldn't reach the account service. Check your connection and try again.";
export const EMAIL_CHANGE_UNUSABLE_MESSAGE = "Choose a different email address.";
export const EMAIL_CHANGE_GENERIC_MESSAGE = "We couldn't start the email change. Try again in a moment.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailChangeFieldErrors(
  nextEmail: string,
  currentPassword: string,
  currentEmail: string | null | undefined,
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  const trimmed = nextEmail.trim();
  if (!trimmed) errors.email = "Enter the new email.";
  else if (!EMAIL_PATTERN.test(trimmed)) errors.email = "Enter an email address like name@example.com.";
  else if (currentEmail && trimmed.toLowerCase() === currentEmail.trim().toLowerCase()) {
    errors.email = "That is already the email on this account.";
  }
  if (!currentPassword) errors.password = "Enter your current password.";
  return errors;
}

type AuthErrorLike = {
  message?: string;
  status?: number | null;
  code?: string | null;
  name?: string;
};

/** Maps Auth errors without repeating raw database text. Reauth failures name the password, not the account. */
export function emailChangeErrorMessage(error: AuthErrorLike | null | undefined, stage: "reauth" | "update"): string {
  if (!error) return EMAIL_CHANGE_GENERIC_MESSAGE;
  const message = error.message ?? "";
  const code = (error.code ?? "").toLowerCase();
  const name = (error.name ?? "").toLowerCase();
  const status = error.status ?? null;

  if (
    status === 0 ||
    name === "authretryablefetcherror" ||
    /failed to fetch|networkerror|network request failed|load failed|timeout|econnreset|enotfound/i.test(message)
  ) {
    return EMAIL_CHANGE_NETWORK_MESSAGE;
  }
  if (status === 429 || code === "over_request_rate_limit" || /rate limit|too many requests|too many attempts/i.test(message)) {
    return EMAIL_CHANGE_RATE_LIMIT_MESSAGE;
  }
  if (stage === "reauth") return EMAIL_CHANGE_PASSWORD_MESSAGE;
  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    /already registered|already been registered|email address already/i.test(message)
  ) {
    return EMAIL_CHANGE_UNUSABLE_MESSAGE;
  }
  return EMAIL_CHANGE_GENERIC_MESSAGE;
}
