import {
  CONNECTION_FEE,
  HOMEPAGE_SIGNUP_HEADLINE,
  SIGNUP_FEE,
  SIGNUP_FEE_NON_REFUNDABLE,
  CONNECTION_FEE_NON_REFUNDABLE,
} from "./pricing";

export const FAQ_PAGE_TITLE = "Questions about Priority Property Pros";

export const FAQ_INTRO =
  "PPP is a local home-services marketplace — not the crew on your driveway. Homeowners pay a one-time $9.99 account activation. Pros pay $4.99 only when they choose to connect. Project payment is between you and the contractor.";

export const FAQ_ITEMS = [
  {
    question: "Is Priority Property Pros the contractor?",
    answer:
      "No. PPP is a technology marketplace that connects property owners with independent local contractors. We do not employ the people who do the work, and we are not a franchise. You hire. They perform.",
  },
  {
    question: "What do homeowners and businesses pay?",
    answer: `${HOMEPAGE_SIGNUP_HEADLINE} After that it is $0/month and there is no PPP Connection Fee for customers. Project payments are made directly with the contractor. ${SIGNUP_FEE_NON_REFUNDABLE}`,
  },
  {
    question: "What do contractors pay?",
    answer: `Everyone pays a one-time ${SIGNUP_FEE} account activation. Contractors then browse opportunities at $0/month and pay ${CONNECTION_FEE} only when they choose to connect. There is no bid fee and no percentage of the job. ${CONNECTION_FEE_NON_REFUNDABLE} Connecting does not guarantee a hire.`,
  },
  {
    question: "Who pays for the actual job?",
    answer:
      "Project payment is between the customer and the contractor. PPP does not take a percentage of that payment under this model.",
  },
  {
    question: "How does hiring work?",
    answer:
      "Post the project. Up to three local independents can connect. You review who connected and choose who to hire. PPP does not pick the contractor for you.",
  },
  {
    question: "Do you verify licenses or insurance?",
    answer:
      "Not currently. Admin approval is not a workmanship inspection. When you hire, ask for proof of insurance and any required local licenses yourself.",
  },
  {
    question: "How do I leave a review of Priority Property Pros?",
    answer:
      "Sign in and visit Reviews. Platform reviews are written by signed-in users about the marketplace. They are not Google reviews and they are not the same as a review of a specific contractor after a completed job.",
  },
  {
    question: "How do I contact PPP?",
    answer:
      "Use the Contact page. That is the right place for marketplace questions — not for paying a contractor or sending job photos.",
  },
] as const;
