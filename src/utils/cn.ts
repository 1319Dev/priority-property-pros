export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function routerBasename(): string {
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/") return "/";
  return base.replace(/\/$/, "");
}

/** Join Vite `base` and a public asset path without introducing double slashes. */
export function joinWithBase(baseUrl: string, assetPath: string): string {
  const normalizedBase = !baseUrl || baseUrl === "/" ? "/" : baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const trimmed = assetPath.replace(/^\//, "");
  return `${normalizedBase}${trimmed}`;
}

export function withBase(path: string): string {
  return joinWithBase(import.meta.env.BASE_URL, path);
}
