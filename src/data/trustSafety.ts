/** Public Trust & Safety copy. Only features that exist in this product. */

import { ATTORNEY_REVIEW_REQUIRED, LEGAL_LAST_UPDATED } from "./legal";

export const TRUST_PAGE_TITLE = "Trust & safety";

export const TRUST_PAGE_LEDE =
  "We would rather under-claim than over-promise. This page lists only what Priority Property Pros actually does today.";

export const TRUST_WHAT_EXISTS = [
  {
    title: "A marketplace, not a crew",
    body: "PPP connects property owners with independent local contractors. PPP is not the contractor and does not employ the people who do the work. PPP does not process, hold in escrow, or payout homeowner-to-contractor project money. After connection, parties pay each other directly.",
  },
  {
    title: "Public browse stays anonymized",
    body: "Anyone can browse approved local pros as generic trade cards with a general area and real PPP ratings when they exist. Business name, phone, email, website, photo, street, and license number are not published to anonymous visitors.",
  },
  {
    title: "Contact after you are connected",
    body: "Exact street, phone, and email stay private until the homeowner and the hired pro are connected through Priority Property Pros after a hire. Seeing a listing, sending an estimate, or a booking that is not connected is not enough.",
  },
  {
    title: "Reviews only after a completed PPP job",
    body: "Homeowners and contractors can review each other only after that completed job. You cannot review yourself, invent a job, or leave a second review from the same side. Public ratings use those eligible reviews only.",
  },
  {
    title: "Low ratings can pause new work",
    body: "If an eligible average is below 4.00 after at least 5 completed-job reviews, PPP can suspend new marketplace participation. History stays. Exactly 4.00 does not suspend. You can appeal.",
  },
  {
    title: "Disputes and appeals",
    body: "Signed-in users can file a dispute from Account → Disputes about a fraudulent or inaccurate review or a rating suspension. Admins review the job, parties, and audit trail. They cannot approve their own case.",
  },
  {
    title: "Account deletion",
    body: "You can request deletion from Account settings. That removes you from the public directory and from new work. Job, Connection Fee, dispute, and audit history are kept. Deletion does not erase evidence of fees owed, reviews, or disputes.",
  },
  {
    title: "Admin approval to join as a pro",
    body: "Contractors finish onboarding and wait for an admin to approve participation. That approval is not a license, insurance, or workmanship verification.",
  },
] as const;

export const TRUST_WHAT_DOES_NOT_EXIST = [
  "PPP does not currently verify licenses, insurance, background, or workmanship.",
  "Priority Verified is not live and is never a code inspection or a guarantee.",
  "PPP does not hold project funds in escrow and does not process live Connection Fee charges or homeowner-to-contractor project payments in this product.",
  "PPP does not guarantee that a contractor will show up, finish, or meet local code.",
  "There is no pay-to-win ranking. Paying does not buy a higher public listing.",
  "Messaging is not built yet.",
] as const;

export const TRUST_HOW_TO_HIRE = [
  "Ask the hired pro for current insurance and any license your city or state requires.",
  "Agree on scope, schedule, and price in writing before work starts.",
  "If something feels wrong, pause. PPP will not pressure you to proceed.",
] as const;

export const TRUST_ATTORNEY_NOTE = ATTORNEY_REVIEW_REQUIRED;
export const TRUST_LAST_UPDATED = LEGAL_LAST_UPDATED;
