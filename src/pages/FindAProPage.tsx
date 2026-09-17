import { ComingSoonLayout, SeeServicesLink } from "./ComingSoonLayout";
import { HOMEPAGE_SIGNUP_HEADLINE } from "../data/pricing";

export function FindAProPage() {
  return (
    <ComingSoonLayout
      eyebrow="Find a Pro"
      title="Browsing local pros comes next."
      body={`Search independent contractors near the property is coming next. Today you can post a project and local independents can respond. ${HOMEPAGE_SIGNUP_HEADLINE} Not a monthly subscription.`}
      extra={<SeeServicesLink />}
    />
  );
}
