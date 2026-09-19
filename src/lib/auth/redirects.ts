import { routerBasename } from "../../utils/cn";

/** Absolute auth redirect that works on localhost and the custom-domain site root. */
export function authRedirectUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = routerBasename();
  const prefix = base === "/" ? "" : base;
  return `${window.location.origin}${prefix}${normalized}`;
}

export const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_RESET_PATH = "/auth/reset-password";
export const AUTH_VERIFY_PATH = "/auth/verify";
