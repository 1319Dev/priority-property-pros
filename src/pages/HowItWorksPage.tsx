import { ComingSoonLayout } from "./ComingSoonLayout";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING } from "../data/pricing";

export function HowItWorksPage() {
  return (
    <ComingSoonLayout
      eyebrow="How it works"
      title="The marketplace in four steps."
      body={`Post the project. Nearby approved pros can review the opportunity. Up to three local independents can respond. You compare estimates, hire, and use project tools. They do the work. Private contact is shared after you are connected through Priority Property Pros. PPP never becomes the contractor. Sign in as a customer to post. ${HOMEPAGE_SIGNUP_HEADLINE} ${HOMEPAGE_SIGNUP_SUPPORTING}`}
    />
  );
}
