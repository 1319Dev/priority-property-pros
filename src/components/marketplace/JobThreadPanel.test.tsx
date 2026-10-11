import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { authValue, profileFor } from "../../lib/auth/authFixture";
import { JobThreadPanel } from "./JobThreadPanel";

const ensureMessageThread = vi.fn();
const listProjectMessages = vi.fn();
const markMessageThreadRead = vi.fn();
const listMyMessageThreads = vi.fn();
const sendProjectMessage = vi.fn();

vi.mock("../../lib/marketplace/messagingApi", () => ({
  ensureMessageThread: (...args: unknown[]) => ensureMessageThread(...args),
  listProjectMessages: (...args: unknown[]) => listProjectMessages(...args),
  markMessageThreadRead: (...args: unknown[]) => markMessageThreadRead(...args),
  listMyMessageThreads: (...args: unknown[]) => listMyMessageThreads(...args),
  sendProjectMessage: (...args: unknown[]) => sendProjectMessage(...args),
}));

function renderPanel(contactShared: boolean) {
  return render(
    <AuthContext.Provider value={authValue({ profile: profileFor("CONTRACTOR"), account_type: "CONTRACTOR" })}>
      <div className="w-[390px] max-w-[390px]">
        <JobThreadPanel
          projectId="p1"
          contractorProfileId="pro-1"
          customerLabel="Pat"
          contactShared={contactShared}
        />
      </div>
    </AuthContext.Provider>,
  );
}

describe("job thread contact notice", () => {
  beforeEach(() => {
    ensureMessageThread.mockReset();
    listProjectMessages.mockReset();
    markMessageThreadRead.mockReset();
    ensureMessageThread.mockResolvedValue("thread-1");
    listProjectMessages.mockResolvedValue([
      {
        id: "m1",
        thread_id: "thread-1",
        sender_profile_id: "customer-1",
        body: "Plymate Property Maintenance",
        created_at: "2026-10-08T18:00:00.000Z",
      },
    ]);
    markMessageThreadRead.mockResolvedValue(undefined);
  });

  it("keeps contact out of the notice until the job page is showing it", async () => {
    renderPanel(false);
    expect(await screen.findByText("Plymate Property Maintenance")).toBeInTheDocument();
    expect(screen.getByText(/this thread does not show phone, email, or street/i)).toBeInTheDocument();
    expect(screen.queryByText(/12 Oak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/936/)).not.toBeInTheDocument();
  });

  it("stops claiming contact is hidden once the paid share is on the job page", async () => {
    renderPanel(true);
    expect(await screen.findByText(/contact box/i)).toBeInTheDocument();
    expect(screen.queryByText(/this thread does not show phone, email, or street/i)).not.toBeInTheDocument();
    expect(screen.getByText("Plymate Property Maintenance")).toBeInTheDocument();
  });
});
