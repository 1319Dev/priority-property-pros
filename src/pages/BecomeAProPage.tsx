import { ComingSoonLayout } from "./ComingSoonLayout";
import { ButtonLink } from "../components/ui/Button";

export function BecomeAProPage() {
  return (
    <ComingSoonLayout
      eyebrow="Become a Pro"
      title="Real projects. Real customers. Fair competition."
      body="Create a contractor account, finish onboarding, and wait for admin approval. You remain an independent business. PPP will not sell the same job to five contractors."
      extra={
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/sign-up/contractor">Create a contractor account</ButtonLink>
          <ButtonLink to="/sign-in" variant="outline">
            Sign in
          </ButtonLink>
        </div>
      }
    />
  );
}
