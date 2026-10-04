import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  CONTACT_PRIORITY_SUPPORT_LABEL,
  PRIORITY_HELP_GREETING,
  PRIORITY_HELP_LIMIT_NOTE,
  PRIORITY_HELP_NAME,
  PRIORITY_HELP_SUBTITLE,
  PRIORITY_SUPPORT_PATH,
} from "../../data/priorityHelp";
import { PriorityHelp } from "./PriorityHelp";

function renderHelp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<PriorityHelp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Priority Help", () => {
  it("uses the official assistant name and keeps it separate from Priority Support", () => {
    expect(PRIORITY_HELP_NAME).toBe("Priority Help");
    expect(PRIORITY_HELP_SUBTITLE).toBe("AI Support Assistant");
    expect(CONTACT_PRIORITY_SUPPORT_LABEL).toBe("Contact Priority Support");
    expect(PRIORITY_SUPPORT_PATH).toBe("/contact");
    expect(PRIORITY_HELP_GREETING).toBe(
      "Hi! I\u2019m Priority Help, the Priority Property Pros AI support assistant. I can help with your account, projects, estimates, payments, reviews, and using Priority Property Pros. What can I help you with?",
    );
    expect(PRIORITY_HELP_GREETING.codePointAt(5)).toBe(0x2019);
    expect(PRIORITY_HELP_NAME).not.toContain("Support");
    expect(CONTACT_PRIORITY_SUPPORT_LABEL).not.toContain("Priority Help");
  });

  it("opens a panel with the greeting, a human handoff, and no invented reply box", async () => {
    const user = userEvent.setup();
    renderHelp();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const launcher = screen.getByRole("button", { name: "Priority Help AI Support Assistant" });
    expect(launcher).toHaveAttribute("aria-expanded", "false");

    await user.click(launcher);
    expect(screen.queryByRole("button", { name: "Priority Help AI Support Assistant" })).not.toBeInTheDocument();

    const panel = screen.getByRole("dialog", { name: PRIORITY_HELP_NAME });
    expect(panel).toHaveTextContent(PRIORITY_HELP_SUBTITLE);
    expect(panel).toHaveTextContent(PRIORITY_HELP_GREETING);
    expect(panel).toHaveTextContent(PRIORITY_HELP_LIMIT_NOTE);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(panel.querySelector("img")).toBeNull();

    const handoff = screen.getByRole("link", { name: CONTACT_PRIORITY_SUPPORT_LABEL });
    expect(handoff).toHaveTextContent(CONTACT_PRIORITY_SUPPORT_LABEL);
    expect(handoff).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("link", { name: PRIORITY_HELP_NAME })).not.toBeInTheDocument();
  });

  it("closes from the panel control and from Escape", async () => {
    const user = userEvent.setup();
    renderHelp();
    const launcher = screen.getByRole("button", { name: "Priority Help AI Support Assistant" });
    await user.click(launcher);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Priority Help AI Support Assistant" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Priority Help AI Support Assistant" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Priority Help AI Support Assistant" })).toHaveFocus();
  });
});
