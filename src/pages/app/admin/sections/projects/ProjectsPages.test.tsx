import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAdminViewport } from "../../../../../test/adminViewport";
import type { ProjectDetail, ProjectRow } from "../../../../../lib/admin/projectsApi";
import { ProjectDetailPage, ProjectsLayout } from "./ProjectsPages";

const fetchProjects = vi.fn();
const fetchProject = vi.fn();

vi.mock("../../../../../lib/admin/projectsApi", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/admin/projectsApi")>("../../../../../lib/admin/projectsApi");
  return {
    ...actual,
    fetchProjects: (...args: unknown[]) => fetchProjects(...args),
    fetchProject: (...args: unknown[]) => fetchProject(...args),
  };
});

const row: ProjectRow = {
  projectId: "proj-1",
  referenceNumber: 1004,
  title: "Fence stain",
  status: "POSTED",
  city: "Conroe",
  state: "TX",
  trade: "Painting",
  customerName: "Owen Home",
  contractorBusinessName: "Plymate Example",
  postedAt: "2026-10-04T18:00:00.000Z",
  disputed: false,
  bookingId: null,
};

const detail: ProjectDetail = {
  ...row,
  description: "Paint the fence",
  customerId: "cust-1",
  history: [{ fromStatus: "DRAFT", toStatus: "POSTED", createdAt: "2026-10-04T18:00:00.000Z" }],
  estimates: [{ estimateId: "est-1", status: "VIEWED", totalCents: 25000, contractorBusinessName: "Plymate Example" }],
  bookings: [],
};

function renderProjects(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/admin/projects" element={<ProjectsLayout />}>
          <Route index element={null} />
          <Route path=":projectId" element={<ProjectDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("projects directory", () => {
  beforeEach(() => {
    fetchProjects.mockReset();
    fetchProject.mockReset();
    fetchProjects.mockResolvedValue({ rows: [row], total: 1 });
    fetchProject.mockResolvedValue(detail);
  });

  it("filters and opens a lifecycle screen on a phone without contact fields", async () => {
    mockAdminViewport(390);
    const user = userEvent.setup();
    renderProjects("/app/admin/projects");
    expect(await screen.findByRole("link", { name: "PPP-1004" })).toHaveAttribute("href", "/app/admin/bookings?ref=PPP-1004");
    expect(screen.queryByText(/street|404-555/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "City" }), "Conroe");
    await user.click(screen.getByRole("link", { name: "Fence stain" }));
    expect(await screen.findByRole("heading", { name: "Fence stain" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open PPP-1004 in booking tools" })).toBeInTheDocument();
    expect(screen.getByText(/DRAFT/)).toBeInTheDocument();
    expect(screen.getByText(/\$250\.00/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fence stain" })).not.toBeInTheDocument();
  });

  it("keeps the list beside the lifecycle at 1280px", async () => {
    mockAdminViewport(1280);
    renderProjects("/app/admin/projects/proj-1");
    expect(await screen.findByRole("heading", { name: "Fence stain" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Lifecycle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fence stain" })).toBeInTheDocument();
  });
});
