import type { AccountStatus, AccountType } from "./types";
import type { SignupFeeStatus } from "../signupFee/constants";
import { postLoginPath } from "./roles";

export function dashboardPath(input: {
  accountType: AccountType | null;
  accountStatus: AccountStatus | null;
  signupFeeEnabled?: boolean | null;
  signupFeeStatus?: SignupFeeStatus | null;
}): string {
  return postLoginPath(input.accountType, input.accountStatus, {
    enabled: input.signupFeeEnabled,
    status: input.signupFeeStatus,
  });
}

/** Signed-in customers go to the wizard. Everyone else keeps the public post page. */
export function authAwarePostPath(
  path: string,
  input: { loading: boolean; accountType: AccountType | null },
): string {
  if (input.loading || input.accountType !== "CUSTOMER") return path;
  const queryIndex = path.indexOf("?");
  const search = queryIndex >= 0 ? path.slice(queryIndex) : "";
  return `/app/customer/projects/new/wizard${search}`;
}

export type PublicViewer = {
  loading: boolean;
  accountType: AccountType | null;
  signedIn?: boolean;
};

/** Hide pro-signup CTAs while the session is unknown and for contractor accounts. */
export function showContractorSignup(input: PublicViewer): boolean {
  return !input.loading && input.accountType !== "CONTRACTOR";
}

/** Customer-signup CTAs are for signed-out visitors who are not already customers. */
export function showCustomerSignup(input: PublicViewer): boolean {
  return !input.loading && !input.signedIn && input.accountType !== "CUSTOMER";
}
