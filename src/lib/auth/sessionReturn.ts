/** In-app path to reopen after sign-in. Rejects off-site and protocol-relative targets. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("\\") || value.includes("://")) return null;
  let url: URL;
  try {
    url = new URL(value, "https://prioritypropertypros.com");
  } catch {
    return null;
  }
  if (url.origin !== "https://prioritypropertypros.com") return null;
  if (url.username || url.password) return null;
  const path = `${url.pathname}${url.search}`;
  if (path === "/sign-in" || path.startsWith("/sign-in?") || path.startsWith("/sign-in/")) return null;
  return path;
}

export function returnPathFromLocation(pathname: string, search: string): string {
  return safeReturnPath(`${pathname}${search}`) ?? "/sign-in";
}
