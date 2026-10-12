/** Plain-language reasons shown when $4.99 checkout is refused before payment. No charge is made. */
const MESSAGES: Record<string, string> = {
  project_not_found: "This project is no longer available. You have not been charged.",
  project_cancelled: "The customer cancelled this project. You have not been charged.",
  project_not_posted: "This project is not posted yet. You have not been charged.",
  connections_closed: "The customer stopped taking new connections on this project. You have not been charged.",
  project_contractor_selected: "The customer already chose a pro for this project. You have not been charged.",
  customer_unavailable: "This customer's account is not available right now. You have not been charged.",
  contractor_not_found: "Only an approved contractor account can connect. You have not been charged.",
  contractor_ineligible: "Your contractor account is not approved to connect right now. You have not been charged.",
  contractor_is_customer: "You cannot connect on your own project. You have not been charged.",
  contractor_blocked: "This project is not available to your account. You have not been charged.",
  opportunity_unavailable: "This opportunity has expired or is no longer offered to you. You have not been charged.",
  already_connected: "You are already connected on this project. You have not been charged again.",
};

export function connectionCheckoutBlockedMessage(reason: string | null): string {
  return (reason && MESSAGES[reason]) || "This connection is not available right now. You have not been charged.";
}

export const CONNECTION_CHECKOUT_BLOCK_REASONS = Object.keys(MESSAGES);
