import { Navigate, useSearchParams } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_SIGNUP_LEDE, SIGNUP_FEE_PUBLIC_NOTE } from "../data/pricing";
import { dashboardPath, showCustomerSignup } from "../lib/auth/publicEntry";
import { useAuth } from "../lib/auth/useAuth";

export function PostProjectPage() {
  const { loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status } = useAuth();
  const [params] = useSearchParams();
  const query = params.toString();
  const home = dashboardPath({
    accountType: account_type,
    accountStatus: account_status,
    signupFeeEnabled: signup_fee_enabled,
    signupFeeStatus: signup_fee_status,
  });

  if (loading) return <BrandLoader layout="page" label="Loading…" />;

  if (user && account_type === "CUSTOMER") {
    return <Navigate to={`/app/customer/projects/new/wizard${query ? `?${query}` : ""}`} replace />;
  }

  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Post a project</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Sign in as a customer to post.</h1>
        <p className="mt-4 text-lg text-ink-700">
          Live posting is on for customer accounts. Contractors use opportunities instead. PPP is not the contractor.
          {` ${CUSTOMER_SIGNUP_LEDE}`}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {user ? <ButtonLink to={home}>My dashboard</ButtonLink> : <ButtonLink to="/sign-in">Sign in</ButtonLink>}
          {showCustomerSignup({ loading, accountType: account_type, signedIn: Boolean(user) }) ? (
            <ButtonLink to="/sign-up/customer" variant="outline">
              Create a customer account
            </ButtonLink>
          ) : null}
        </div>
        <p className="mt-4 text-sm text-ink-500">{SIGNUP_FEE_PUBLIC_NOTE}</p>
      </Container>
    </section>
  );
}
