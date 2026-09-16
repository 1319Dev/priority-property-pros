import { ComingSoonLayout, SeeServicesLink } from "./ComingSoonLayout";

export function FindAProPage() {
  return (
    <ComingSoonLayout
      eyebrow="Find a Pro"
      title="Browsing local pros comes next."
      body="In a later phase you will search independent contractors near the property. Today you can still explore the public service list on the homepage."
      extra={<SeeServicesLink />}
    />
  );
}
