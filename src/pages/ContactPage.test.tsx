import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { SUPPORT_EMAIL } from "../data/brand";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { submitContactForm } from "../lib/contact/submitContactForm";
import { ContactPage } from "./ContactPage";

vi.mock("../lib/contact/submitContactForm", () => ({
  isContactTopic: (value: string) =>
    value === "marketplace" || value === "account" || value === "billing" || value === "report" || value === "other",
  submitContactForm: vi.fn(),
}));

const message = "How do connection fees work for a side-yard fence?";

function renderContact(width: number) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <div className="mx-auto max-w-full" style={{ width }}>
            <ContactPage />
          </div>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: /your name/i }), "Ada Lovelace");
  await user.type(screen.getByRole("textbox", { name: /^email$/i }), "ada@example.com");
  await user.type(screen.getByRole("textbox", { name: /phone/i }), "936-555-0100");
  await user.selectOptions(screen.getByRole("combobox", { name: /topic/i }), "marketplace");
  await user.type(screen.getByRole("textbox", { name: /^message$/i }), message);
  return user;
}

describe.each([390, 1280])("contact form at %ipx", (width) => {
  beforeEach(() => {
    vi.mocked(submitContactForm).mockReset();
  });

  it("shows the fields and the support mailto", () => {
    renderContact(width);
    expect(screen.getByRole("textbox", { name: /your name/i })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /^email$/i })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /phone/i })).not.toBeRequired();
    expect(screen.getByRole("combobox", { name: /topic/i })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /^message$/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /send message/i })).toBeVisible();
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    expect(document.querySelector("input[name='company_website']")).not.toBeNull();
  });

  it("shows a success state without repeating the message", async () => {
    vi.mocked(submitContactForm).mockResolvedValue({ ok: true });
    renderContact(width);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/message sent/i);
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send message/i })).not.toBeInTheDocument();
    expect(submitContactForm).toHaveBeenCalledWith(expect.objectContaining({ companyWebsite: "", topic: "marketplace" }));
  });

  it("shows the mailto fallback when sending is unavailable", async () => {
    vi.mocked(submitContactForm).mockResolvedValue({ ok: false, code: "unavailable" });
    renderContact(width);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: /send message/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(alert).toHaveTextContent(SUPPORT_EMAIL);
    expect(alert).not.toHaveTextContent(message);
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
  });
});
