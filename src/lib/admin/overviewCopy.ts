import type { DashboardMetric } from "./dashboardApi";

/**
 * Plain sentences under each Overview number. The database definition is precise but reads like SQL,
 * so it is not shown or read aloud.
 */
export const OVERVIEW_CARD_DESCRIPTIONS: Record<string, string> = {
  homeowners: "Homeowner accounts, not counting deleted ones.",
  contractors: "Contractor accounts, not counting deleted ones.",
  active_approved_contractors: "Approved contractors whose account is active.",
  awaiting_approval: "Contractor applications waiting for a decision.",
  identity_review_required: "Approved contractors who need to re-verify their credentials.",
  projects_posted: "Projects homeowners have posted. Drafts are not counted.",
  projects_open: "Posted projects that are still looking for a pro.",
  awaiting_estimates: "Open projects that have no estimate yet.",
  marked_hired: "Jobs where the homeowner and the pro both confirmed the hire.",
  completed: "Jobs marked complete.",
  revenue_month_cents: "Activation and Connect fees paid this month (Central time).",
  revenue_lifetime_cents: "All activation and Connect fees paid, in live mode.",
  revenue_net_cents: "Fees paid, minus refunds recorded so far.",
  checkouts_completed: "Activation and Connect checkouts that were paid.",
  checkouts_expired: "Checkouts that were opened and abandoned.",
  checkouts_open: "Checkouts started and not finished yet.",
  card_declines: "Card payments that were declined.",
  pending_photo_approvals: "Portfolio photos waiting for review.",
  platform_reviews_pending: "Site reviews waiting for approval.",
  content_reports_30d: "Reports from users in the last 30 days.",
  disputed_bookings: "Jobs a homeowner, pro, or admin has disputed.",
  support_tickets: "Support requests.",
};

export function overviewCardDescription(key: string): string | null {
  return OVERVIEW_CARD_DESCRIPTIONS[key] ?? null;
}

/**
 * A metric the database marks unavailable is hidden instead of showing a placeholder.
 * A failed load still shows the card with a dash so the admin can see something went wrong.
 */
export function overviewCardVisible(metric: DashboardMetric | undefined, failed: boolean): boolean {
  if (failed) return true;
  if (!metric) return false;
  return metric.status !== "unavailable";
}
