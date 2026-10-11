/** App-side complement to the Supabase Auth minimum. The dashboard setting is the real enforcement. */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_TOO_SHORT_MESSAGE = "Use at least 8 characters.";

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  return null;
}
