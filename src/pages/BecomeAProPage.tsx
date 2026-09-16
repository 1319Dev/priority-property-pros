import { ComingSoonLayout } from "./ComingSoonLayout";
import { ButtonLink } from "../components/ui/Button";

export function BecomeAProPage() {
  return (
    <ComingSoonLayout
      eyebrow="Become a Pro"
      title="Real projects. Real customers. Fair competition."
      body="You can create a contractor account now. Live job matching, estimates, and payouts are still later phases. You remain an independent business. PPP will not sell the same lead five times."
      extra={
        <div className="mt-6">
          <ButtonLink to="/sign-up/contractor">Create a contractor account</ButtonLink>
        </div>
      }
    />
  );
}
