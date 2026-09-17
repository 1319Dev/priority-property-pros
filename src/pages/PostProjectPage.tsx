import { Navigate, useSearchParams } from "react-router-dom";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { useAuth } from "../lib/auth/useAuth";
import { needsSignupFeePayment } from "../lib/signupFee/policy";

export function PostProjectPage() {
  const { loading, user, account_type, signup_fee_status } = useAuth();
  const [params] = useSearchParams();
  const query = params.toString();

  if (!loading && user && account_type === "CUSTOMER") {
    if (needsSignupFeePayment(account_type, signup_fee_status)) {
      return <Navigate to="/account/activate" replace />;
    }
    return <Navigate to={`/app/customer/projects/new/wizard${query ? `?${query}` : ""}`} replace />;
  }

  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Post a project</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Sign in as a customer to post.</h1>
        <p className="mt-4 text-lg text-ink-700">
          Live posting is on for customer accounts. Contractors use opportunities instead. PPP is not the contractor.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/sign-in">Sign in</ButtonLink>
          <ButtonLink to="/sign-up/customer" variant="outline">
            Create a customer account
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
