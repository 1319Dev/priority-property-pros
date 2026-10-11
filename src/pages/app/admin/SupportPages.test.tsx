import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminSupportConversationPage, AdminSupportKnowledgePage, AdminSupportQueuePage } from "./SupportPages";

vi.mock("../../../lib/admin/supportApi", () => ({
  listSupportQueue: vi.fn(async () => ({
    queue: "open",
    availability: "offline",
    rows: [
      {
        id: "conv-1",
        reference: "PH-10001",
        status: "OPEN",
        priority: "HIGH",
        assignedAdminId: null,
        createdAt: "",
        lastMessageAt: null,
        role: "CUSTOMER",
        displayName: "Ada Lovelace",
        guest: false,
      },
    ],
  })),
  searchSupport: vi.fn(async () => []),
  setSupportPresence: vi.fn(async (status: string) => status),
  heartbeatSupport: vi.fn(async () => undefined),
  subscribeSupportDesk: vi.fn(() => () => undefined),
  getSupportConversation: vi.fn(async () => ({
    id: "conv-1",
    reference: "PH-10001",
    status: "OPEN",
    priority: "HIGH",
    humanJoined: false,
    availability: "offline",
    messages: [
      { id: "pub", role: "customer", visibility: "public", body: "Please look at my registration.", createdAt: "" },
      { id: "note", role: "admin", visibility: "internal", body: "Asked billing to check the receipt.", createdAt: "" },
    ],
    account: {
      profileId: "ada",
      role: "CUSTOMER",
      accountStatus: "ACTIVE",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      contractorProfileId: null,
      businessName: null,
      profileHref: null,
    },
  })),
  listCannedResponses: vi.fn(async () => [{ id: "c1", title: "Greeting", body: "Hello from Priority Help.", updatedAt: "" }]),
  replySupport: vi.fn(),
  noteSupport: vi.fn(),
  setSupportStatus: vi.fn(),
  setSupportPriority: vi.fn(),
  takeoverSupport: vi.fn(),
  listSupportArticles: vi.fn(async () => [
    { id: "a1", slug: "payments-and-fees", title: "Payments and fees", body: "Activation is $9.99.", status: "PUBLISHED", updatedAt: "" },
  ]),
  saveSupportArticle: vi.fn(async () => []),
  saveCannedResponse: vi.fn(async () => []),
  deleteCannedResponse: vi.fn(async () => undefined),
}));

describe("admin support pages", () => {
  it("lists the open queue and does not say a person has joined", async () => {
    render(
      <MemoryRouter initialEntries={["/app/admin/support"]}>
        <AdminSupportQueuePage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name: /PH-10001/ })).toBeInTheDocument();
    expect(screen.getByText(/Desk is offline/i)).toBeInTheDocument();
    expect(screen.getByText(/only after you take the conversation/i)).toBeInTheDocument();
  });

  it("shows an internal note that is labeled as hidden from the customer", async () => {
    render(
      <MemoryRouter initialEntries={["/app/admin/support/conv-1"]}>
        <Routes>
          <Route path="/app/admin/support/:conversationId" element={<AdminSupportConversationPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Asked billing to check the receipt.")).toBeInTheDocument();
    expect(screen.getByText("Customers never see this.")).toBeInTheDocument();
    expect(screen.getByText(/has not joined/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open contractor profile" })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/dangerouslySetInnerHTML|<script/i);
  });

  it("edits knowledge base articles in a textarea", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminSupportKnowledgePage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /Payments and fees/ }));
    const body = screen.getByRole("textbox", { name: "Article body" });
    expect(body.tagName).toBe("TEXTAREA");
    expect(body).toHaveValue("Activation is $9.99.");
  });
});
