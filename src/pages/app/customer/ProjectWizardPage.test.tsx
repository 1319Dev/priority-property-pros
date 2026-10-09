import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWizardPage } from "./ProjectWizardPage";
import { clearWizardSession } from "../../../lib/marketplace/wizardSession";

vi.mock("../../../lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { id: "user-1" },
    loading: false,
  }),
}));

vi.mock("../../../lib/marketplace/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/marketplace/api")>("../../../lib/marketplace/api");
  return {
    ...actual,
    fetchServiceCategories: vi.fn(),
    fetchServiceQuestions: vi.fn(),
    fetchProject: vi.fn(),
    submitNewProject: vi.fn(),
  };
});

import { fetchProject, fetchServiceCategories, fetchServiceQuestions, submitNewProject } from "../../../lib/marketplace/api";

const fetchCategories = vi.mocked(fetchServiceCategories);
const fetchQuestions = vi.mocked(fetchServiceQuestions);
const fetchExisting = vi.mocked(fetchProject);
const submit = vi.mocked(submitNewProject);

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/app/customer/projects/new/wizard"]}>
      <Routes>
        <Route path="/app/customer/projects/new/wizard" element={<ProjectWizardPage />} />
        <Route path="/app/customer/projects/:projectId" element={<p>Posted project</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("post-a-project wizard", () => {
  beforeEach(() => {
    clearWizardSession();
    fetchCategories.mockReset();
    fetchQuestions.mockReset();
    fetchExisting.mockReset();
    submit.mockReset();
    fetchCategories.mockResolvedValue([
      {
        id: "cat-handyman",
        slug: "handyman",
        name: "Handyman",
        blurb: "Small repairs",
        sort_order: 1,
        is_active: true,
        is_regulated: false,
        requires_verified_credential: false,
      },
    ]);
    fetchQuestions.mockResolvedValue([]);
    submit.mockResolvedValue("proj-posted");
  });

  it("keeps the form in the tab and creates a project only when Post is clicked", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(await screen.findByLabelText(/what do you need done/i), "Fence repair");
    expect(document.querySelector("[data-pwa-form='project-wizard']")).not.toBeNull();
    expect(submit).not.toHaveBeenCalled();
    expect(fetchExisting).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("radio", { name: /handyman/i }));
    expect(submit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("ZIP"), "30318");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("button", { name: "Post project" })).toBeEnabled();
    expect(submit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Post project" }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "user-1",
        userId: "user-1",
        title: "Fence repair",
        categoryId: "cat-handyman",
        zipCode: "30318",
        photos: [],
      }),
    );
    expect(await screen.findByText("Posted project")).toBeInTheDocument();
  });
});
