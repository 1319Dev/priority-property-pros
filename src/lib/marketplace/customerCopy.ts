import { JOB_PAYMENT_PLAIN } from "../../data/pricing";
import { SUPPORT_EMAIL } from "../../data/brand";

/** One plain sentence. Use at most once on a customer page. */
export const CUSTOMER_PAYS_DIRECTLY = JOB_PAYMENT_PLAIN;

export const CUSTOMER_ACTIVATION_NOTE =
  "One-time $9.99 account activation (paid at signup). No monthly fee and no connection fee for customers.";

export const CUSTOMER_HOME_INTRO =
  "Post a project, review connections, and choose a local pro.";

export const CUSTOMER_HOME_EMPTY =
  "Post a project when you know what needs doing. Nothing is saved until you hit Post.";

export const STREET_STAYS_PRIVATE =
  "Your street address stays private. You choose when to share it with a pro.";

export const NO_PROS_YET = "No pros in your area yet. We'll keep looking.";

export const OFFER_QUEUE_PLAIN =
  "We offer this to a few local pros at a time. If someone passes, we ask the next pro.";

export const CANCEL_PROJECT_BODY =
  "This project will be cancelled and move to your Cancelled list. Pros can no longer respond. Estimates stay in your history and are marked cancelled.";

export const CANCEL_PROJECT_TOAST = "Project cancelled.";

export const STOP_CONNECTIONS_BODY =
  "New pros will not be offered this project. Pros you already connected with can still message you. Nothing is deleted.";

export const STOP_CONNECTIONS_TOAST = "New pros will not be offered this project.";

export const COMPARE_INTRO =
  "Factual comparison only. PPP does not rank a best estimate. Up to three local pros can price the job.";

export const SELECT_CONFIRM_BODY =
  "Choosing this pro starts a booking. Your street address stays private until you share it.";

export const SELECTED_BOOKING_COPY = "You selected this pro. Open the booking to confirm you are working together.";

export const HIRED_BOOKING_COPY = "You and this pro both confirmed Hired.";

export const WIZARD_PERSIST_NOTE =
  "Nothing is saved until you hit Post. What you type stays in this browser tab. Photos need to be added again if you reload the page.";

export const POST_BLOCKED_REASON = "Add a title, a project type, and a ZIP code before posting.";

export const CUSTOMER_SUPPORT_LINE = `Questions? Email ${SUPPORT_EMAIL}`;

export const APP_CONTACT_LINE = SUPPORT_EMAIL;

export const HIRE_AGAIN_INTRO =
  "Pros you have finished a job with. Post a new project when you want to work with them again.";

export const HIRE_AGAIN_EMPTY =
  "After a job is marked complete, that pro shows up here.";

export const TARGETED_PRO_NOTE =
  "This project is offered to pros in this trade who work in your area, including the pro you were looking at when they match.";

export const ACCOUNT_ROLE_NOTE = "Your role is Customer. This site cannot change it.";

export function postProjectPath(input?: { contractorId?: string | null; trade?: string | null }): string {
  const params = new URLSearchParams();
  if (input?.contractorId) params.set("pro", input.contractorId);
  if (input?.trade) params.set("trade", input.trade);
  const query = params.toString();
  return query ? `/post-project?${query}` : "/post-project";
}

export function customerWizardPath(input?: { contractorId?: string | null; trade?: string | null }): string {
  const params = new URLSearchParams();
  if (input?.contractorId) params.set("pro", input.contractorId);
  if (input?.trade) params.set("trade", input.trade);
  const query = params.toString();
  return query ? `/app/customer/projects/new/wizard?${query}` : "/app/customer/projects/new/wizard";
}
