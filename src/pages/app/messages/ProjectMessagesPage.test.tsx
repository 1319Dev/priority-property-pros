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
const subscribeToProjectMessages = vi.fn(() => () => undefined);

function pass(mock: { (...args: never[]): unknown }, args: unknown[]) {
  return (mock as (...inner: unknown[]) => unknown)(...args);
}

vi.mock("../../../lib/marketplace/messagingApi", () => ({
  listMyMessageThreads: (...args: unknown[]) => pass(listMyMessageThreads, args),
  ensureMessageThread: (...args: unknown[]) => pass(ensureMessageThread, args),
  listProjectMessages: (...args: unknown[]) => pass(listProjectMessages, args),
  sendProjectMessage: (...args: unknown[]) => pass(sendProjectMessage, args),
  subscribeToProjectMessages: (...args: unknown[]) => pass(subscribeToProjectMessages, args),
}));

vi.mock("../../../lib/marketplace/api", () => ({
  fetchMyNotifications: vi.fn(async () => []),
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
    subscribeToProjectMessages.mockClear();
    listMyMessageThreads.mockResolvedValue([]);
    listProjectMessages.mockResolvedValue([]);
    ensureMessageThread.mockResolvedValue("thread-1");
    sendProjectMessage.mockResolvedValue(undefined);
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
  });

  it("stays locked when the connection entitlement is missing", async () => {
    ensureMessageThread.mockRejectedValue(new Error("messaging is locked until the $4.99 connection entitlement"));
    renderAt("/app/customer/messages/p1/pro-2");
    expect(await screen.findByText(MESSAGES_LOCKED_BODY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
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
