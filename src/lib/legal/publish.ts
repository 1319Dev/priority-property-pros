/**
 * Draft Terms and Privacy stay off the public site until this build flag is the
 * string "true". An unset GitHub Actions variable stays off. Do not default it on.
 */
export function legalPagesPublished(
  env: string | undefined = import.meta.env.VITE_PUBLISH_LEGAL_PAGES,
): boolean {
  return env === "true";
}
