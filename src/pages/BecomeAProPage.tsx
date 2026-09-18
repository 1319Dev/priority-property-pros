import { ComingSoonLayout } from "./ComingSoonLayout";
import { ButtonLink } from "../components/ui/Button";
import {
  CONTRACTOR_SIGNUP_HEADLINE,
  CONTRACTOR_SIGNUP_SUPPORTING,
  SIGNUP_FEE_SHORT,
} from "../data/pricing";

export function BecomeAProPage() {
  return (
    <ComingSoonLayout
      photo="house"
      eyebrow="Become a Pro"
      title="Real projects. Real customers. Fair competition."
      body={`${CONTRACTOR_SIGNUP_HEADLINE} ${CONTRACTOR_SIGNUP_SUPPORTING} Create a contractor account, finish onboarding, and wait for admin approval. You remain an independent business. PPP will not sell the same job to five contractors.`}
      extra={
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/sign-up/contractor">Create a contractor account</ButtonLink>
          <ButtonLink to="/sign-in" variant="outline">
            Sign in
          </ButtonLink>
          <p className="w-full text-sm text-ink-500">{SIGNUP_FEE_SHORT}. Not a monthly subscription.</p>
        </div>
      }
    />
  );
}
