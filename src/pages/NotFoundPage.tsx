import { Navigate, useLocation } from "react-router-dom";
import { ComingSoonLayout } from "./ComingSoonLayout";
import { legacyRedirectTarget } from "../data/legacyRedirects";
import { NOT_FOUND_TITLE } from "../lib/seo/routeMeta";
import { useNoindex } from "../lib/seo/useNoindex";
import { usePageTitle } from "../lib/seo/usePageTitle";

export function NotFoundPage() {
  const { pathname } = useLocation();
  const redirectTo = legacyRedirectTarget(pathname);
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }
  return <NotFoundContent />;
}

function NotFoundContent() {
  usePageTitle(NOT_FOUND_TITLE);
  useNoindex();
  return (
    <ComingSoonLayout
      eyebrow="Not found"
      title="That page is not on this site."
      body="Try home, FAQ, sign in, or post a project."
    />
  );
}
