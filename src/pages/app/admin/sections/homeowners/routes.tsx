import { lazy } from "react";
import { Route } from "react-router-dom";

const HomeownersLayout = lazy(() => import("./HomeownersPages").then((mod) => ({ default: mod.HomeownersLayout })));
const HomeownerDetailPage = lazy(() =>
  import("./HomeownersPages").then((mod) => ({ default: mod.HomeownerDetailPage })),
);

export const adminSectionRoutes = [
  <Route key="homeowners" path="homeowners" element={<HomeownersLayout />}>
    <Route index element={null} />
    <Route path=":profileId" element={<HomeownerDetailPage />} />
  </Route>,
];
