import { lazy } from "react";
import { Route } from "react-router-dom";

const ProjectsLayout = lazy(() => import("./ProjectsPages").then((mod) => ({ default: mod.ProjectsLayout })));
const ProjectDetailPage = lazy(() => import("./ProjectsPages").then((mod) => ({ default: mod.ProjectDetailPage })));

export const adminSectionRoutes = [
  <Route key="projects" path="projects" element={<ProjectsLayout />}>
    <Route index element={null} />
    <Route path=":projectId" element={<ProjectDetailPage />} />
  </Route>,
];
