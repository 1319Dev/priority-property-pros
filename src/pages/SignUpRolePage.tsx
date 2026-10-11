import { Link, Navigate, useSearchParams } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { AuthCard } from "../lib/auth/AuthCard";
import { dashboardPath } from "../lib/auth/publicEntry";
import { requestsVerifierSignup } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";
import {
  CONNECTION_FEE_NO_HIRE_GUARANTEE,
  HOMEOWNER_PRICING_SUMMARY,
  JOB_PAYMENT_PLAIN,
  PRO_PRICING_SUMMARY,
  SIGNUP_FEE_NOT_MONTHLY,
  SIGNUP_ROLE_LEDE,
} from "../data/pricing";

const options = [
  {
    to: "/sign-up/customer",
    label: "I need work done",
    account: "Customer account",
    detail: HOMEOWNER_PRICING_SUMMARY,
  },
  {
    to: "/sign-up/contractor",
    label: "I want to get hired",
    account: "Contractor account",
    detail: `${PRO_PRICING_SUMMARY} ${CONNECTION_FEE_NO_HIRE_GUARANTEE}`,
  },
];

export function SignUpRolePage() {
  const { loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <BrandLoader layout="page" label="Loading…" />;
  if (user && account_type) {
    return (
      <Navigate
        to={dashboardPath({
          accountType: account_type,
          accountStatus: account_status,
          signupFeeEnabled: signup_fee_enabled,
          signupFeeStatus: signup_fee_status,
        })}
        replace
      />
    );
  }
  if (requestsVerifierSignup([params.get("role"), params.get("account_type"), params.get("accountType"), params.get("type")])) {
    return <Navigate to="/sign-up" replace />;
  }

  return (
    <AuthCard
      eyebrow="Create account"
      title="How will you use Priority Property Pros?"
      lede={SIGNUP_ROLE_LEDE}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-semibold text-forest-800 underline">
            Sign in
          </Link>
          . There is no public Admin signup.
        </>
      }
    >
      <section className="rounded-3xl border border-forest-800/10 bg-cream-100 px-5 py-4 text-sm leading-relaxed text-ink-700" aria-labelledby="signup-before-checkout">
        <h2 id="signup-before-checkout" className="font-semibold text-forest-800">
          Before checkout
        </h2>
        <p className="mt-2">{SIGNUP_FEE_NOT_MONTHLY}</p>
        <p className="mt-2">
          Customer and contractor accounts pay that same one-time activation. A customer posts work and does not pay a
          PPP Connection Fee. A contractor is an independent pro who browses first and pays $4.99 only when they choose
          to connect. {JOB_PAYMENT_PLAIN}
        </p>
      </section>
      <ul className="space-y-3">
        {options.map((option) => (
          <li key={option.to}>
            <Link
              to={option.to}
              data-auth-card=""
              className="flex w-full min-w-0 flex-col items-stretch gap-1 rounded-3xl border border-forest-800/15 bg-cream-50 px-5 py-4 text-left transition-colors hover:border-forest-800 hover:bg-cream-100"
            >
              <p className="min-w-0 whitespace-normal font-semibold text-forest-800">{option.label}</p>
              <p className="min-w-0 whitespace-normal text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">
                {option.account}
              </p>
              <p className="min-w-0 whitespace-normal text-sm leading-relaxed text-ink-700">{option.detail}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AuthCard>
  );
}
