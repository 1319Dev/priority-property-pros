import { ComingSoonLayout } from "./ComingSoonLayout";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING } from "../data/pricing";

export function HowItWorksPage() {
  return (
    <ComingSoonLayout
      eyebrow="How it works"
      title="The marketplace in four steps."
      body={`Post the project. Up to three local independents can connect. You review connections and choose. They do the work. PPP never becomes the contractor and does not take a percentage of the job. Sign in as a customer to post. ${HOMEPAGE_SIGNUP_HEADLINE} ${HOMEPAGE_SIGNUP_SUPPORTING}`}
    />
  );
}
