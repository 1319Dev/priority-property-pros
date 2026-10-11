import { lazy } from "react";
import { Route } from "react-router-dom";

const PaymentsPage = lazy(() => import("./PaymentsPage").then((mod) => ({ default: mod.PaymentsPage })));

export const adminSectionRoutes = [<Route key="payments" path="payments" element={<PaymentsPage />} />];
