import { Navigate, useLocation } from "react-router-dom";
import { ComingSoonLayout } from "./ComingSoonLayout";
import { legacyRedirectTarget } from "../data/legacyRedirects";

export function NotFoundPage() {
  const { pathname } = useLocation();
  const redirectTo = legacyRedirectTarget(pathname);
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <ComingSoonLayout
      eyebrow="Not found"
      title="That page is not on this site."
      body="Try home, FAQ, sign in, or post a project."
    />
  );
}
