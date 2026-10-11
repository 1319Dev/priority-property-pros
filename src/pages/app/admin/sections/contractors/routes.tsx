import { lazy } from "react";
import { Route } from "react-router-dom";

const ContractorsLayout = lazy(() => import("./ContractorsPages").then((mod) => ({ default: mod.ContractorsLayout })));
const ContractorDetailPage = lazy(() =>
  import("./ContractorsPages").then((mod) => ({ default: mod.ContractorDetailPage })),
);

export const adminSectionRoutes = [
  <Route key="contractors" path="contractors" element={<ContractorsLayout />}>
    <Route index element={null} />
    <Route path=":contractorProfileId" element={<ContractorDetailPage />} />
  </Route>,
];
