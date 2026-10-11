import { StrictMode, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "../../components/notifications/NotificationBell";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import { resetNotificationRealtimeForTests } from "../../lib/notifications/realtime";
import { __setSupabaseClientForTests, type TypedSupabaseClient } from "../../lib/supabase/client";
import { NotificationHistoryPage } from "./NotificationHistoryPage";

vi.mock("../../lib/supabase/config", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
  getSupabaseAnonKey: () => "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public",
  isSupabaseConfigured: () => true,
}));

const unreadRow = {
  id: "n1",
  kind: "estimate.received",
  title: "New estimate received",
  body: "A pro sent an estimate on your project.",
  entity_type: "estimates",
  entity_id: "est-1",
  payload: {
    project_id: "proj-1",
    estimate_id: "est-1",
    project_title: "Fence repair",
    project_reference_number: 1004,
    path: "/app/customer/projects/proj-1/estimates/est-1",
  },
  channel: "in_app",
  read_at: null,
  created_at: "2026-10-08T12:00:00.000Z",
  action_state: "open",
};

function installClient(options?: { explode?: boolean }) {
  const names: string[] = [];
  const onCounts: number[] = [];
  let notify: (() => void) | null = null;
  let listCalls = 0;
  const client = {
    channel(name: string) {
      const existing = names.includes(name) ? null : undefined;
      void existing;
      names.push(name);
      let subscribed = false;
      let ons = 0;
      const api = {
        on(event: string, _filter: unknown, callback: () => void) {
          ons += 1;
          onCounts[names.length - 1] = ons;
          if (options?.explode || (subscribed && event === "postgres_changes")) {
            throw new Error(
              "cannot add postgres_changes callbacks for realtime:notifications:user-1 after subscribe()",
            );
          }
          if (event === "postgres_changes") notify = callback;
          return api;
        },
        subscribe(status: (next: string) => void) {
          subscribed = true;
          status("SUBSCRIBED");
          return api;
        },
      };
      return api;
    },
    removeChannel() {
      return Promise.resolve("ok");
    },
    rpc(name: string) {
      if (name === "list_my_notifications") {
        listCalls += 1;
        return Promise.resolve({ data: [unreadRow], error: null });
      }
      if (name === "mark_notification_read" || name === "mark_all_my_notifications_read") {
        return Promise.resolve({ data: {}, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "missing" } });
    },
  };
  __setSupabaseClientForTests(client as unknown as TypedSupabaseClient);
  return {
    names,
    onCounts,
    listCalls: () => listCalls,
    fire: () => notify?.(),
  };
}

function renderHistory(children: ReactNode = (
  <>
    <NotificationBell />
    <NotificationHistoryPage />
  </>
)) {
  return render(
    <AuthContext.Provider value={signedInAuth("CUSTOMER")}>
      <MemoryRouter>{children}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("notification realtime hub", () => {
  afterEach(() => {
    resetNotificationRealtimeForTests();
    __setSupabaseClientForTests(null);
  });

  it("shares one channel between the bell and history and keeps a read stamp", async () => {
    const user = userEvent.setup();
    const client = installClient();
    renderHistory();

    expect(await screen.findByRole("heading", { name: "Notification history" })).toBeInTheDocument();
    expect(await screen.findAllByText("Fence repair · PPP-1004")).not.toHaveLength(0);
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(client.names).toHaveLength(1);
    expect(client.names[0]).toMatch(/^notifications:user-1:/);
    expect(client.onCounts).toEqual([1]);
    expect(document.body.textContent).not.toMatch(/postgres_changes|after subscribe/i);

    await user.click(screen.getByRole("link", { name: /new estimate received/i }));
    await waitFor(() => expect(screen.queryByText("Unread")).not.toBeInTheDocument());
    const listsBeforeRefresh = client.listCalls();
    client.fire();
    await waitFor(() => expect(client.listCalls()).toBeGreaterThan(listsBeforeRefresh));
    expect(screen.queryByText("Unread")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notification history" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/postgres_changes|after subscribe/i);
  });

  it("still renders history when subscribing throws", async () => {
    installClient({ explode: true });
    renderHistory(
      <StrictMode>
        <NotificationBell />
        <NotificationHistoryPage />
      </StrictMode>,
    );
    expect(await screen.findByRole("heading", { name: "Notification history" })).toBeInTheDocument();
    expect(await screen.findByText(/new estimate received/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/postgres_changes|after subscribe/i);
  });
});
