export const SIGN_IN_INVALID_MESSAGE = "The email or password is incorrect.";
export const SIGN_IN_UNCONFIRMED_MESSAGE =
  "Confirm your email before signing in. Check your inbox for the verification link.";
export const SIGN_IN_RATE_LIMIT_MESSAGE = "Too many attempts. Wait a few minutes, then try again.";
export const SIGN_IN_NETWORK_MESSAGE =
  "We couldn't reach the sign-in service. Check your connection and try again.";
export const SIGN_IN_GENERIC_MESSAGE = "We couldn't sign you in. Try again in a moment.";

export type SignInAuthError = {
  message?: string;
  status?: number | null;
  code?: string | null;
  name?: string;
};

/** Same message for a wrong email and a wrong password. Does not say which one failed. */
export function signInErrorMessage(error: SignInAuthError | null | undefined): string | null {
  if (!error) return null;
  const message = error.message ?? "";
  const code = (error.code ?? "").toLowerCase();
  const name = (error.name ?? "").toLowerCase();
  const status = error.status ?? null;

  if (
    status === 0 ||
    name === "authretryablefetcherror" ||
    /failed to fetch|networkerror|network request failed|load failed|timeout|econnreset|enotfound/i.test(message)
  ) {
    return SIGN_IN_NETWORK_MESSAGE;
  }
  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    /rate limit|too many requests|too many attempts|for security purposes/i.test(message)
  ) {
    return SIGN_IN_RATE_LIMIT_MESSAGE;
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return SIGN_IN_UNCONFIRMED_MESSAGE;
  }
  if (
    code === "invalid_credentials" ||
    /invalid login credentials|invalid email or password|user not found|no user found/i.test(message)
  ) {
    return SIGN_IN_INVALID_MESSAGE;
  }
  return SIGN_IN_GENERIC_MESSAGE;
}

export function signInFieldErrors(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  const trimmed = email.trim();
  if (!trimmed) errors.email = "Enter your email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    errors.email = "Enter an email address like name@example.com.";
  }
  if (!password) errors.password = "Enter your password.";
  return errors;
}
