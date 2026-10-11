import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractorEditor, CustomerEditor } from "../../../lib/admin/profileEditorApi";
import { ContractorProfileEditor, CustomerProfileEditor } from "./ProfileEditors";

const fetchCustomerEditor = vi.fn();
const saveCustomerProfile = vi.fn();
const fetchContractorEditor = vi.fn();
const saveContractorProfile = vi.fn();

vi.mock("../../../lib/admin/profileEditorApi", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/admin/profileEditorApi")>("../../../lib/admin/profileEditorApi");
  return {
    ...actual,
    fetchCustomerEditor: (...args: unknown[]) => fetchCustomerEditor(...args),
    saveCustomerProfile: (...args: unknown[]) => saveCustomerProfile(...args),
    fetchContractorEditor: (...args: unknown[]) => fetchContractorEditor(...args),
    saveContractorProfile: (...args: unknown[]) => saveContractorProfile(...args),
  };
});

const customer: CustomerEditor = {
  profileId: "c1",
  firstName: "Owen",
  lastName: "Home",
  email: "owen@example.com",
  phone: "2815550100",
  avatarUrl: "",
  accountStatus: "ACTIVE",
  location: { streetLine1: "", streetLine2: "", city: "", state: "", zipCode: "" },
  notifications: [],
  projects: [],
  categories: [],
};

const contractor: ContractorEditor = {
  contractorProfileId: "k1",
  profileId: "kp1",
  businessName: "Pat Pro LLC",
  firstName: "Pat",
  lastName: "Pro",
  email: "pat@example.com",
  phone: "7135550100",
  avatarUrl: "",
  bio: "",
  headline: "",
  primaryTrade: "",
  licenseNumber: "",
  insuranceCarrier: "",
  approvalStatus: "APPROVED",
  accountStatus: "ACTIVE",
  directoryHidden: false,
  directoryListed: true,
  serviceCategoryIds: [],
  serviceAreas: [],
  credentials: [],
  portfolio: [],
  categories: [],
};

beforeEach(() => {
  fetchCustomerEditor.mockReset().mockResolvedValue(customer);
  saveCustomerProfile.mockReset().mockResolvedValue({ ...customer, firstName: "Owen J" });
  fetchContractorEditor.mockReset().mockResolvedValue(contractor);
  saveContractorProfile.mockReset().mockResolvedValue({ ...contractor, directoryHidden: true });
});

describe("CustomerProfileEditor", () => {
  it("does not load anything until Edit is pressed", () => {
    render(<CustomerProfileEditor profileId="c1" />);
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeInTheDocument();
    expect(fetchCustomerEditor).not.toHaveBeenCalled();
  });

  it("edits inline, confirms with a required reason, then saves only the change", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<CustomerProfileEditor profileId="c1" onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    const first = await screen.findByLabelText("First name");
    await user.clear(first);
    await user.type(first, "Owen J");
    await user.click(screen.getByRole("button", { name: "Review and save" }));

    const dialog = await screen.findByRole("dialog", { name: "Save profile changes?" });
    expect(within(dialog).getByText("First name")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/reason/i);
    expect(saveCustomerProfile).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Reason for this change"), "Customer called to fix a typo");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveCustomerProfile).toHaveBeenCalledWith("c1", { first_name: "Owen J" }, "Customer called to fix a typo"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/audit log/);
    expect(onSaved).toHaveBeenCalled();
  });

  it("stops before the dialog when nothing changed or a field is invalid", async () => {
    const user = userEvent.setup();
    render(<CustomerProfileEditor profileId="c1" />);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await screen.findByLabelText("Phone");
    await user.click(screen.getByRole("button", { name: "Review and save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No changes to save.");
    const phone = screen.getByLabelText("Phone");
    await user.clear(phone);
    await user.type(phone, "123");
    await user.click(screen.getByRole("button", { name: "Review and save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a 10-digit phone number.");
    expect(screen.queryByRole("dialog", { name: "Save profile changes?" })).toBeNull();
  });
});

describe("ContractorProfileEditor", () => {
  it("hides from the directory as a sensitive change and shows the step-up note", async () => {
    const user = userEvent.setup();
    render(<ContractorProfileEditor contractorProfileId="k1" />);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(await screen.findByLabelText("Show in the public directory"));
    await user.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog", { name: "Save profile changes?" });
    expect(within(dialog).getByText("Directory visibility")).toBeInTheDocument();
    expect(within(dialog).getByText(/authenticator code/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Payments, fees, and Stripe records are not changed/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Insurance lapsed");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveContractorProfile).toHaveBeenCalledWith("k1", { directory_hidden: true }, "Insurance lapsed"));
  });

  it("shows the server error inside the dialog and keeps the draft", async () => {
    saveContractorProfile.mockRejectedValueOnce(new Error("That email is already in use."));
    const user = userEvent.setup();
    render(<ContractorProfileEditor contractorProfileId="k1" />);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    const email = await screen.findByLabelText("Sign-in email");
    await user.clear(email);
    await user.type(email, "taken@example.com");
    await user.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog", { name: "Save profile changes?" });
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Owner request");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That email is already in use.");
    expect(screen.getByLabelText("Sign-in email")).toHaveValue("taken@example.com");
  });
});
