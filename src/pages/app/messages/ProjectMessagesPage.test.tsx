import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../../lib/auth/AuthContext";
import type { Profile } from "../../../lib/auth/types";
import { PRE_HIRE_CONTACT_MESSAGE } from "../../../lib/marketplace/antiCircumvention";
import { MESSAGES_EMPTY_BODY, MESSAGES_LOCKED_BODY } from "../../../lib/marketplace/messaging";
import { CustomerShell } from "../CustomerShell";
import { ProShell } from "../ProShell";
import { ProjectMessagesPage } from "./ProjectMessagesPage";

const listMyMessageThreads = vi.fn();
const ensureMessageThread = vi.fn();
const listProjectMessages = vi.fn();
const sendProjectMessage = vi.fn();
const markMessageThreadRead = vi.fn();
const subscribeToProjectMessages = vi.fn(() => () => undefined);
const getSharedProjectContact = vi.fn();
const shareProjectContact = vi.fn();

function pass(mock: { (...args: never[]): unknown }, args: unknown[]) {
  return (mock as (...inner: unknown[]) => unknown)(...args);
}

vi.mock("../../../lib/marketplace/messagingApi", () => ({
  listMyMessageThreads: (...args: unknown[]) => pass(listMyMessageThreads, args),
  ensureMessageThread: (...args: unknown[]) => pass(ensureMessageThread, args),
  listProjectMessages: (...args: unknown[]) => pass(listProjectMessages, args),
  sendProjectMessage: (...args: unknown[]) => pass(sendProjectMessage, args),
  markMessageThreadRead: (...args: unknown[]) => pass(markMessageThreadRead, args),
  subscribeToProjectMessages: (...args: unknown[]) => pass(subscribeToProjectMessages, args),
}));

vi.mock("../../../lib/marketplace/api", () => ({
  fetchMyNotifications: vi.fn(async () => []),
}));

vi.mock("../../../lib/marketplace/contactShareApi", () => ({
  getSharedProjectContact: (...args: unknown[]) => pass(getSharedProjectContact, args),
  shareProjectContact: (...args: unknown[]) => pass(shareProjectContact, args),
}));

function profile(): Profile {
  return {
    id: "user-1",
    email: "pat@example.com",
    first_name: "Pat",
    last_name: "Lee",
    phone: "404-555-0100",
    avatar_url: null,
    account_type: "CUSTOMER",
    account_status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function auth(): AuthContextValue {
  return {
    configured: true,
    loading: false,
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    session: null,
    profile: profile(),
    account_type: "CUSTOMER",
    account_status: "ACTIVE",
    signup_fee_status: "PAID",
    signup_fee_enabled: true,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsEmailConfirm: true }),
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    requestPasswordReset: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
    resendVerification: async () => ({ error: null }),
  };
}

function renderAt(path: string, ui: ReactNode = <ProjectMessagesPage role="customer" />) {
  return render(
    <AuthContext.Provider value={auth()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/customer/messages" element={ui} />
          <Route path="/app/customer/messages/:projectId/:contractorProfileId" element={ui} />
          <Route path="/app/pro/messages" element={ui} />
          <Route path="/app/pro/messages/:projectId/:contractorProfileId" element={ui} />
          <Route path="/app/customer/*" element={<CustomerShell />} />
          <Route path="/app/pro/*" element={<ProShell />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("project messages UI", () => {
  beforeEach(() => {
    listMyMessageThreads.mockReset();
    ensureMessageThread.mockReset();
    listProjectMessages.mockReset();
    sendProjectMessage.mockReset();
    markMessageThreadRead.mockReset();
    markMessageThreadRead.mockResolvedValue(undefined);
    subscribeToProjectMessages.mockClear();
    listMyMessageThreads.mockResolvedValue([]);
    listProjectMessages.mockResolvedValue([]);
    ensureMessageThread.mockResolvedValue("thread-1");
    sendProjectMessage.mockResolvedValue(undefined);
    getSharedProjectContact.mockResolvedValue({
      eligible: true,
      customer_shared: false,
      name: "Pat Lee",
      phone: "404-555-0199",
      email: "pat@example.com",
      street_line1: "12 Oak Street",
      street_line2: null,
      city: "Decatur",
      state: "GA",
      zip_code: "30030",
    });
    shareProjectContact.mockResolvedValue({
      eligible: true,
      customer_shared: true,
      name: "Pat Lee",
      phone: "404-555-0199",
      email: "pat@example.com",
      street_line1: "12 Oak Street",
      street_line2: null,
      city: "Decatur",
      state: "GA",
      zip_code: "30030",
    });
  });

  it("does not open another thread when the route ids are not real records", async () => {
    listMyMessageThreads.mockResolvedValue([
      {
        thread_id: "thread-real",
        project_id: "p1",
        contractor_profile_id: "pro-1",
        project_title: "Fence repair",
        project_reference_number: 1004,
        city: "Decatur",
        state: "GA",
        contractor_label: "Approved Fence Pro",
        last_message_at: "2026-10-04T18:19:48.000Z",
        last_preview: "Approved Fence Pro",
        last_sender_id: "other",
      },
    ]);
    renderAt("/app/pro/messages/x/y", <ProjectMessagesPage role="contractor" />);
    expect(await screen.findByRole("heading", { name: "Conversation not found" })).toBeInTheDocument();
    expect(ensureMessageThread).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Fence repair" })).not.toBeInTheDocument();
    expect(screen.getByText("No message text yet")).toBeInTheDocument();
  });

  it("explains that activation alone does not open a thread", async () => {
    renderAt("/app/customer/messages");
    expect(await screen.findByText(MESSAGES_EMPTY_BODY)).toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/street/i)).not.toBeInTheDocument();
    expect(screen.queryByText("404-555-0100")).not.toBeInTheDocument();
    expect(screen.queryByText("pat@example.com")).not.toBeInTheDocument();
  });

  it("lists a connected thread without contact fields and sends plain text", async () => {
    const user = userEvent.setup();
    listMyMessageThreads.mockResolvedValue([
      {
        thread_id: "thread-1",
        project_id: "p1",
        contractor_profile_id: "pro-1",
        project_title: "Fence repair",
        city: "Decatur",
        state: "GA",
        contractor_label: "Approved Fence Pro",
        last_message_at: null,
        last_preview: null,
      },
    ]);
    renderAt("/app/customer/messages/p1/pro-1");
    expect(await screen.findByRole("heading", { name: "Fence repair" })).toBeInTheDocument();
    expect(screen.getAllByText("Approved Fence Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Decatur, GA").length).toBeGreaterThan(0);
    expect(screen.getByText(/does not show phone, email, or street/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /share my contact & address/i })).toBeInTheDocument();
    expect(screen.getByText("404-555-0199")).toBeInTheDocument();
    expect(screen.getByText(/message box still blocks/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/write about the work/i), "Monday morning works.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sendProjectMessage).toHaveBeenCalledWith("thread-1", "user-1", "Monday morning works.");
  });

  it("refuses a phone or email in the composer", async () => {
    const user = userEvent.setup();
    renderAt("/app/customer/messages/p1/pro-1");
    await screen.findByPlaceholderText(/write about the work/i);
    await user.type(screen.getByPlaceholderText(/write about the work/i), "Email pat@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sendProjectMessage).not.toHaveBeenCalled();
    expect(await screen.findByText(PRE_HIRE_CONTACT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/write about the work/i)).toHaveValue("Email pat@example.com");
  });

  it("stays locked when the connection entitlement is missing", async () => {
    ensureMessageThread.mockRejectedValue(new Error("messaging is locked until the $4.99 connection entitlement"));
    renderAt("/app/customer/messages/p1/pro-2");
    expect(await screen.findByText(MESSAGES_LOCKED_BODY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share my contact/i })).not.toBeInTheDocument();
    expect(screen.queryByText("404-555-0199")).not.toBeInTheDocument();
    expect(screen.queryByText("12 Oak Street")).not.toBeInTheDocument();
  });

  it("asks before sharing and does not put contact into the message", async () => {
    const user = userEvent.setup();
    renderAt("/app/customer/messages/p1/pro-1");
    await user.click(await screen.findByRole("button", { name: /share my contact & address/i }));
    await user.click(screen.getByRole("button", { name: /share with this contractor/i }));
    expect(shareProjectContact).toHaveBeenCalledWith("p1", "pro-1");
    expect(sendProjectMessage).not.toHaveBeenCalled();
    expect(await screen.findByText(/shared with this contractor/i)).toBeInTheDocument();
  });

  it("hides phone, email, and street from the contractor until the customer shares", async () => {
    getSharedProjectContact.mockResolvedValue({
      eligible: true,
      customer_shared: false,
      name: "Pat Lee",
      phone: "404-555-0199",
      email: "pat@example.com",
      street_line1: "12 Oak Street",
      city: "Decatur",
      state: "GA",
      zip_code: "30030",
    });
    renderAt("/app/pro/messages/p1/pro-1", <ProjectMessagesPage role="contractor" />);
    expect(await screen.findByText(/has not shared contact yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share my contact/i })).not.toBeInTheDocument();
    expect(screen.queryByText("404-555-0199")).not.toBeInTheDocument();
    expect(screen.queryByText("pat@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/12 Oak Street/i)).not.toBeInTheDocument();
  });
});

describe("messages navigation", () => {
  it("adds Messages to the customer and contractor dashboards", () => {
    renderAt("/app/customer/home", <CustomerShell />);
    expect(screen.getAllByRole("link", { name: "Messages" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Messages" })[0]).toHaveAttribute("href", "/app/customer/messages");
  });

  it("adds Messages for contractors", () => {
    render(
      <AuthContext.Provider value={{ ...auth(), account_type: "CONTRACTOR" }}>
        <MemoryRouter initialEntries={["/app/pro"]}>
          <ProShell />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const links = screen.getAllByRole("link", { name: "Messages" });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "/app/pro/messages");
  });
});
