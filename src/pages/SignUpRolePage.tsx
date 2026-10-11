import { Link, Navigate, useSearchParams } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { AuthCard } from "../lib/auth/AuthCard";
import { dashboardPath } from "../lib/auth/publicEntry";
import { requestsVerifierSignup } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";
import { SIGNUP_ROLE_LEDE } from "../data/pricing";

const options = [
  {
    to: "/sign-up/customer",
    label: "I need work done",
    detail:
      "Homeowners & Businesses. Post projects, review connections, and hire. One-time $9.99 account activation — not a monthly subscription. No PPP Connection Fee. The $9.99 account activation fee is non-refundable.",
  },
  {
    to: "/sign-up/contractor",
    label: "I want to get hired",
    detail:
      "Independent contractors. One-time $9.99 account activation, then $0/month. Browse first. Pay $4.99 only when you choose to connect. The $9.99 activation fee and the $4.99 Connection Fee are non-refundable.",
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
      <ul className="space-y-3">
        {options.map((option) => (
          <li key={option.to}>
            <Link
              to={option.to}
              className="block rounded-3xl border border-forest-800/15 bg-cream-50 px-5 py-4 transition-colors hover:border-forest-800 hover:bg-cream-100"
            >
              <p className="font-semibold text-forest-800">{option.label}</p>
              <p className="mt-1 text-sm text-ink-700">{option.detail}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AuthCard>
  );
}
