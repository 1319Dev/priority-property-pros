import { ComingSoonLayout, SeeServicesLink } from "./ComingSoonLayout";

export function FindAProPage() {
  return (
    <ComingSoonLayout
      eyebrow="Find a Pro"
      title="Browsing local pros comes next."
      body="Search independent contractors near the property is coming next. Today you can post a project and local independents can respond."
      extra={<SeeServicesLink />}
    />
  );
}
