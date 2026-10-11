import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { authValue, signedInAuth } from "../../lib/auth/authFixture";
import type { HelpRequest, HelpResult, HelpTransport } from "../../lib/support/client";
import { AppShell } from "../layout/AppShell";
import { DashboardShell } from "../layout/DashboardShell";
import { PriorityHelp } from "./PriorityHelp";

function idle(partial: Partial<HelpResult> = {}): HelpResult {
  return {
    ok: true,
    mode: "ai",
    availability: "available",
    humanJoined: false,
    reference: null,
    alreadyOpen: false,
    messages: [],
    guestToken: null,
    answer: null,
    error: null,
    ...partial,
  };
}

function renderHelp(ui: ReactNode, path = "/") {
  return render(
    <AuthContext.Provider value={authValue()}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Priority Help widget", () => {
  it("sits above the mobile tab bar and opens a dialog", async () => {
    const user = userEvent.setup();
    const transport: HelpTransport = { request: vi.fn(async () => idle()) };
    renderHelp(<PriorityHelp transport={transport} />);
    const launcher = screen.getByRole("button", { name: "Priority Help" });
    expect(launcher.className).toContain("bottom-[calc(6.25rem+env(safe-area-inset-bottom))]");
    expect(launcher.className).toContain("lg:bottom-6");
    expect(launcher.className).not.toContain("z-40");

    await user.click(launcher);
    const dialog = await screen.findByRole("dialog", { name: "Priority Help" });
    expect(dialog.className).toContain("motion-reduce:transition-none");
    expect(dialog.className).toContain("bottom-[calc(10.75rem+env(safe-area-inset-bottom))]");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your message" })).toHaveFocus());
    expect(screen.getByRole("status").textContent).toMatch(/has not joined/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/responding/i);
  });

  it("traps focus and restores it when Escape closes the dialog", async () => {
    const user = userEvent.setup();
    const transport: HelpTransport = { request: vi.fn(async () => idle()) };
    renderHelp(<PriorityHelp transport={transport} />);
    const launcher = screen.getByRole("button", { name: "Priority Help" });
    await user.click(launcher);
    await screen.findByRole("dialog", { name: "Priority Help" });
    const talk = await screen.findByRole("button", { name: "Talk to Support" });
    await waitFor(() => expect(talk).toBeEnabled());
    talk.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close Priority Help" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("shows an AI answer and keeps contact details out of the transcript", async () => {
    const user = userEvent.setup();
    const transport: HelpTransport = {
      request: vi.fn(async (input: HelpRequest) => {
        if (input.action === "send") {
          return idle({
            messages: [
              { id: "c", role: "customer", body: input.body ?? "", createdAt: "" },
              { id: "a", role: "assistant", body: "Email hidden@secret.com about the 7% fee.", createdAt: "" },
            ],
          });
        }
        return idle();
      }),
    };
    renderHelp(<PriorityHelp transport={transport} />);
    await user.click(screen.getByRole("button", { name: "Priority Help" }));
    const box = await screen.findByRole("textbox", { name: "Your message" });
    await user.type(box, "What does activation cost?");
    await user.click(await screen.findByRole("button", { name: "Send" }));
    const log = await screen.findByRole("log", { name: "Priority Help messages" });
    expect(log.textContent).toMatch(/What does activation cost/);
    expect(log.textContent).toMatch(/can't share account or contact details/i);
    expect(log.textContent).not.toMatch(/hidden@secret.com|7%/);
    expect(screen.getByRole("status").textContent).not.toMatch(/responding/i);
  });

  it("offers Talk to Support only when AI is off, including the offline form", async () => {
    const user = userEvent.setup();
    const transport: HelpTransport = {
      request: vi.fn(async (input: HelpRequest) => {
        if (input.action === "escalate") {
          return idle({
            mode: "human_only",
            availability: "offline",
            reference: "PH-10001",
            humanJoined: false,
            messages: [
              { id: "c", role: "customer", body: input.body ?? "", createdAt: "" },
              {
                id: "s",
                role: "system",
                body: "Support is offline. Your message is saved. A person has not joined this chat.",
                createdAt: "",
              },
            ],
          });
        }
        return idle({ mode: "human_only", availability: "offline" });
      }),
    };
    renderHelp(<PriorityHelp transport={transport} />);
    await user.click(screen.getByRole("button", { name: "Priority Help" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/offline/i);
    expect(await screen.findByText(/Nobody is in this chat yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Please look at my registration.");
    await user.click(screen.getByRole("button", { name: "Talk to Support" }));
    expect(await screen.findByText("Reference PH-10001")).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toMatch(/has not joined/i);
    expect(screen.getByRole("log").textContent).not.toMatch(/is responding/i);
  });

  it("hides the launcher on the admin layout and mounts it on public and dashboard shells", () => {
    const transport: HelpTransport = { request: vi.fn(async () => idle()) };
    const { unmount } = renderHelp(<PriorityHelp transport={transport} />, "/app/admin/approvals");
    expect(screen.queryByRole("button", { name: "Priority Help" })).not.toBeInTheDocument();
    unmount();

    renderHelp(
      <AuthContext.Provider value={authValue()}>
        <AppShell />
      </AuthContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "Priority Help" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "App" })).toBeInTheDocument();
  });

  it("mounts on the dashboard shell and loads history for a signed-in customer", async () => {
    render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter>
          <DashboardShell items={[{ to: "/app/customer", label: "Home", end: true }]} eyebrow="Customer" />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "Priority Help" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Dashboard" }).length).toBeGreaterThan(0);

    const request = vi.fn(async () => idle({ messages: [{ id: "old", role: "assistant", body: "Activation is $9.99.", createdAt: "" }] }));
    render(
      <AuthContext.Provider value={signedInAuth("CUSTOMER")}>
        <MemoryRouter>
          <PriorityHelp transport={{ request }} initialOpen />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: "history", signedIn: true })));
    expect(await screen.findByText("Activation is $9.99.")).toBeInTheDocument();
  });

  it("keeps the honeypot out of the tab order", async () => {
    const user = userEvent.setup();
    renderHelp(<PriorityHelp transport={{ request: vi.fn(async () => idle()) }} />);
    await user.click(screen.getByRole("button", { name: "Priority Help" }));
    await screen.findByRole("dialog");
    const trap = document.querySelector('input[name="company_website"]');
    expect(trap).toHaveAttribute("aria-hidden", "true");
    expect(trap).toHaveAttribute("tabindex", "-1");
  });
});
