import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactMessage } from "../../../lib/admin/contactMessagesApi";
import { AdminContactMessagesPage } from "./AdminContactMessagesPage";

const listContactMessages = vi.fn();
const getContactMessage = vi.fn();
const markContactMessageHandled = vi.fn();

vi.mock("../../../lib/admin/contactMessagesApi", () => ({
  listContactMessages: (...args: unknown[]) => listContactMessages(...args),
  getContactMessage: (...args: unknown[]) => getContactMessage(...args),
  markContactMessageHandled: (...args: unknown[]) => markContactMessageHandled(...args),
  contactEmailWasSent: (status: string) => status === "sent",
}));

vi.mock("../../../lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

const open: ContactMessage = {
  id: "msg-1",
  createdAt: "2026-10-10T15:04:00.000Z",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "936-555-0100",
  topic: "marketplace",
  message: "How do connection fees work for a side-yard fence?",
  emailStatus: "sent",
  handledAt: null,
};

const older: ContactMessage = {
  ...open,
  id: "msg-2",
  createdAt: "2026-10-09T12:00:00.000Z",
  name: "Grace Hopper",
  email: "grace@example.com",
  phone: null,
  topic: "billing",
  message: "Where is my receipt?",
  emailStatus: "failed",
  handledAt: "2026-10-09T18:00:00.000Z",
};

function renderMessages(path = "/app/admin/contact") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/admin/contact" element={<AdminContactMessagesPage />} />
        <Route path="/app/admin/contact/:messageId" element={<AdminContactMessagesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("admin contact messages", () => {
  beforeEach(() => {
    listContactMessages.mockReset();
    getContactMessage.mockReset();
    markContactMessageHandled.mockReset();
    listContactMessages.mockResolvedValue([open, older]);
    getContactMessage.mockResolvedValue(open);
    markContactMessageHandled.mockResolvedValue("2026-10-10T16:00:00.000Z");
  });

  it("lists unhandled messages newest first with send status", async () => {
    renderMessages();
    expect(await screen.findByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/app/admin/contact/msg-1");
    expect(screen.getByText("Email sent")).toBeInTheDocument();
    expect(screen.getByText("936-555-0100")).toBeInTheDocument();
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
  });

  it("searches and can include handled messages", async () => {
    const user = userEvent.setup();
    renderMessages();
    await screen.findByRole("link", { name: "Ada Lovelace" });
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Email not sent")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /search messages/i }), "receipt");
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("opens a detail view with a reply link that does not include the message", async () => {
    const user = userEvent.setup();
    renderMessages();
    await user.click(await screen.findByRole("link", { name: "Ada Lovelace" }));
    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText(open.message)).toBeInTheDocument();
    const reply = screen.getByRole("link", { name: "Reply" });
    expect(reply).toHaveAttribute("href", "mailto:ada@example.com?subject=Re%3A%20Marketplace%20question");
    expect(reply.getAttribute("href")).not.toContain("fence");
    await user.click(screen.getByRole("button", { name: "Mark handled" }));
    expect(markContactMessageHandled).toHaveBeenCalledWith("msg-1");
    expect(await screen.findByText(/Handled/)).toBeInTheDocument();
  });

  it("shows an admin refusal without the message body", async () => {
    markContactMessageHandled.mockRejectedValue(new Error("You need an admin sign-in to do that."));
    const user = userEvent.setup();
    renderMessages("/app/admin/contact/msg-1");
    await user.click(await screen.findByRole("button", { name: "Mark handled" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/admin sign-in/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/fence/i);
  });
});
