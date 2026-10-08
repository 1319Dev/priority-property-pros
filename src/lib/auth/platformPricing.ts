import type { SignupFeeStatus } from "../signupFee/constants";
import { needsSignupFeePayment } from "../signupFee/policy";
import type { AccountType } from "./types";
import { useAuth } from "./useAuth";

export type PlatformPricingViewer = {
  loading: boolean;
  signedIn: boolean;
  accountType: AccountType | null;
  signupFeeEnabled?: boolean | null;
  signupFeeStatus?: SignupFeeStatus | null;
};

/**
 * Display-only. An activated customer is a signed-in CUSTOMER whose signup fee
 * is already satisfied (`needsSignupFeePayment` is false, including when the
 * fee flag is off). They should not see platform prices. Visitors, contractors,
 * and customers who still owe the $9.99 activation step still should.
 */
export function hidePlatformPricing(viewer: PlatformPricingViewer): boolean {
  if (viewer.loading || !viewer.signedIn || viewer.accountType !== "CUSTOMER") return false;
  return !needsSignupFeePayment({
    enabled: viewer.signupFeeEnabled,
    accountType: "CUSTOMER",
    status: viewer.signupFeeStatus,
  });
}

export function useHidePlatformPricing(): boolean {
  const { loading, user, account_type, signup_fee_enabled, signup_fee_status } = useAuth();
  return hidePlatformPricing({
    loading,
    signedIn: Boolean(user),
    accountType: account_type,
    signupFeeEnabled: signup_fee_enabled,
    signupFeeStatus: signup_fee_status,
  });
}
