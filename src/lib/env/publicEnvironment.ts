/** Public build environment. Used only for a visible staging/preview banner. */

export const STAGING_PREVIEW_BANNER_LABEL = "STAGING / PREVIEW";

export const STAGING_PREVIEW_BANNER_BODY =
  "This is a staging preview, not the production site. Payments are not live.";

export function normalizePublicEnvironment(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isStagingPublicEnvironment(
  value: string | null | undefined = import.meta.env.VITE_PUBLIC_ENVIRONMENT,
): boolean {
  return normalizePublicEnvironment(value) === "staging";
}
