import { ComingSoonLayout } from "./ComingSoonLayout";

export function NotFoundPage() {
  return (
    <ComingSoonLayout
      eyebrow="Not found"
      title="That page is not on this site."
      body="Try home, sign in, or post a project as a preview of what comes later."
    />
  );
}
