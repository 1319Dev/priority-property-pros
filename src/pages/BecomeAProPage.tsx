import { ComingSoonLayout } from "./ComingSoonLayout";
import { ButtonLink } from "../components/ui/Button";

export function BecomeAProPage() {
  return (
    <ComingSoonLayout
      eyebrow="Become a Pro"
      title="Real projects. Real customers. Fair competition."
      body="Create a contractor account for $9.99, finish onboarding, and wait for admin approval. Paying does not skip verification. You remain an independent business. Marketplace fees apply only when you are hired."
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
