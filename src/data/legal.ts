/** Public legal copy. Attorney review is required before launch. Not legal advice. */

export const LEGAL_LAST_UPDATED = "September 18, 2026";

export const ATTORNEY_REVIEW_REQUIRED =
  "Attorney review required before launch. This page is an operational draft, not legal advice, and is not a substitute for counsel.";

export const LEGAL_PAGES = [
  { slug: "terms", path: "/legal/terms", title: "Terms of Use" },
  { slug: "privacy", path: "/legal/privacy", title: "Privacy Policy" },
  { slug: "marketplace-disclaimer", path: "/legal/marketplace-disclaimer", title: "Marketplace Disclaimer" },
  { slug: "community-guidelines", path: "/legal/community-guidelines", title: "Community & Review Guidelines" },
  { slug: "dispute-policy", path: "/legal/dispute-policy", title: "Dispute Policy" },
  { slug: "suspension-termination", path: "/legal/suspension-termination", title: "Account Suspension & Termination" },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]["slug"];

export type LegalSection = { heading: string; paragraphs: string[] };

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  lastUpdated: string;
  attorneyReviewRequired: true;
  sections: LegalSection[];
};

const marketplaceNature = [
  "Priority Property Pros (\"PPP\") is a local marketplace operated by PRIORITY PROPERTY PROS LLC. PPP connects property owners with independent local contractors. PPP is not the contractor, not an employer of the people who do the work, not a franchise, and not affiliated with Angi or Thumbtack.",
  "Contractors who appear on PPP remain independent businesses. A listing, estimate, hire, review, or account badge is not employment, partnership, or a joint venture with PPP.",
];

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terms: {
    slug: "terms",
    title: "Terms of Use",
    lastUpdated: LEGAL_LAST_UPDATED,
    attorneyReviewRequired: true,
    sections: [
      {
        heading: "Agreement",
        paragraphs: [
          "These Terms of Use are a draft for the Priority Property Pros marketplace. They need attorney review before launch.",
          ...marketplaceNature,
          "By creating an account you agree to use the service lawfully, to provide accurate information, and to follow the Community & Review Guidelines and Dispute Policy.",
        ],
      },
      {
        heading: "Accounts",
        paragraphs: [
          "Everyone pays a one-time $9.99 account activation. That fee is described on the Pricing page. Online checkout is not live in this product yet, so creating an account does not charge a card today.",
          "Homeowners have no monthly subscription. Contractors may stay on the Free plan at $0/month. Priority Pro is described as Coming Soon and cannot be purchased in this product.",
          "You may not create an Admin account from the website. Role and status are assigned by PPP, not by a client toggle.",
        ],
      },
      {
        heading: "Marketplace use",
        paragraphs: [
          "Homeowners may post projects, compare estimates, and hire through PPP. Contractors may review nearby opportunities, submit estimates, and track jobs after they are approved to participate.",
          "At most three contractors can participate on a posted project. Contact details and exact street addresses stay private until the parties are connected through PPP after a hire.",
          "There is no pay-to-win ranking. Paying the activation fee or a Connection Fee does not buy a better public listing position.",
        ],
      },
      {
        heading: "What PPP does and does not do",
        paragraphs: [
          "PPP earns revenue from the $9.99 activation fee, a flat $4.99 Connection Fee when homeowners select contractors, and future Priority Pro subscriptions.",
          "The Connection Fee is $4.99 per legitimate new connection, regardless of project value. It is for the marketplace service of connecting the parties, not a percentage of the project payment.",
          "PPP does not process, hold in escrow, or payout homeowner-to-contractor project money. After the parties are connected through PPP, they communicate directly and arrange project payment themselves.",
          "Connection Fee checkout is Coming Soon and is not live in this product. Connection Fees are calculated and displayed, but no live charges occur.",
          "PPP does not currently verify licenses, insurance, or workmanship. Priority Verified is not live and is never a code inspection or a guarantee.",
          "You remain responsible for checking licenses, insurance, scope, and local requirements before work starts.",
        ],
      },
      {
        heading: "Reviews, disputes, and account action",
        paragraphs: [
          "Reviews may be left only after a completed PPP job by the homeowner and the hired contractor on that job. Public ratings use those eligible reviews only.",
          "If an account's eligible average is below 4.00 after at least 5 completed-job reviews, PPP may suspend new marketplace participation. History is kept. You may appeal from Account → Disputes.",
          "PPP may deactivate, suspend, or close accounts that violate these terms, the Community & Review Guidelines, or applicable law. See Account Suspension & Termination.",
        ],
      },
      {
        heading: "Anti-circumvention",
        paragraphs: [
          "You may not intentionally hide contact information in photos, estimates, or project descriptions to bypass the connection workflow and the applicable $4.99 Connection Fee.",
          "You may not cancel and rebook to avoid the Connection Fee owed on the original connection.",
          "Violations may result in account suspension or termination. PPP may investigate reports of circumvention but does not promise real-time monitoring or automatic detection. Reporting and moderation are the enforcement mechanisms.",
          "After you are connected through PPP, PPP does not control how the homeowner pays the contractor for project work. The Connection Fee is for the marketplace service of connecting the parties, not for processing the project payment.",
        ],
      },
      {
        heading: "Limitation",
        paragraphs: [
          "To the fullest extent allowed by law, PPP is a venue. Independent contractors perform the work. These draft terms do not create warranties PPP has not implemented.",
        ],
      },
    ],
  },
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    lastUpdated: LEGAL_LAST_UPDATED,
    attorneyReviewRequired: true,
    sections: [
      {
        heading: "What this policy covers",
        paragraphs: [
          "This Privacy Policy describes data this product actually collects and stores today. It needs attorney review before launch. It is not a claim about vendors or practices that are not in the code.",
          "Account login uses a hosted authentication service. Marketplace records are stored in a hosted Postgres database. File uploads use private storage buckets.",
        ],
      },
      {
        heading: "Account and profile data",
        paragraphs: [
          "When you create an account we store your email, password (handled by the auth service), first name, last name, optional phone, optional avatar, account role, and account status.",
          "Contractor applicants also store business name, trade, service area, optional website, bio, headline, job-size preferences, onboarding answers, portfolio captions, and credential documents they upload for admin review.",
          "We record that you accepted the Terms and Privacy Policy, including the version and time.",
        ],
      },
      {
        heading: "Projects, estimates, and jobs",
        paragraphs: [
          "Project posts store title, description, service category, answers, city, state, ZIP, timing, budget range, and optional photos. Exact street and map coordinates are stored separately and are not shown to browsing contractors until the parties are connected through PPP after a hire.",
          "Estimates store line items, totals, and a Connection Fee preview. Bookings store job amounts, fee snapshots, status history, and change orders.",
          "After a completed job, each side may store a 1–5 star rating and an optional written review.",
        ],
      },
      {
        heading: "Public directory",
        paragraphs: [
          "The public Find a Pro directory shows an anonymized trade label, general area, categories, years of experience when present, screened portfolio captions, and rating totals from eligible PPP reviews. It does not publish business legal name, email, phone, website, photo, street address, or license number to anonymous visitors.",
          "Demo/example cards are labeled as examples and are not live contractor identities.",
        ],
      },
      {
        heading: "Disputes, safety, and audit",
        paragraphs: [
          "If you file a dispute we store the category, your explanation, the optional review id, timestamps, status, and optional evidence you upload. Admins can inspect the related job, parties, and audit trail.",
          "Security-sensitive actions write append-only audit records (actor, action, time, and a metadata payload). Clients cannot edit or delete those records.",
          "In-app notifications store a title, body, and related record id. They are written so they do not carry private street, phone, or email.",
        ],
      },
      {
        heading: "What we do not do in this product",
        paragraphs: [
          "This product does not run live Connection Fee charges or process homeowner-to-contractor project payments. Payment flags remain off. PPP does not hold project funds in escrow.",
          "We do not sell the same homeowner lead to multiple buyers.",
          "Messaging is not built yet. We do not currently operate a separate advertising pixel pack on the marketing pages.",
          "We do not claim to sell or rent your contact list. Contact details stay locked until a hire connection.",
        ],
      },
      {
        heading: "Account deletion",
        paragraphs: [
          "You may request deletion from Account settings. We remove the account from the public directory and from new marketplace participation, replace public name and contact fields with a generic deleted-account label, and keep legal, financial, dispute, audit, and completed-job history needed to preserve marketplace integrity. Deletion does not erase evidence of Connection Fees owed, reviews given or received, or dispute history.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [
          "Privacy questions can be sent to the support email published on the site. This draft should be reviewed by counsel before launch.",
        ],
      },
    ],
  },
  "marketplace-disclaimer": {
    slug: "marketplace-disclaimer",
    title: "Marketplace Disclaimer",
    lastUpdated: LEGAL_LAST_UPDATED,
    attorneyReviewRequired: true,
    sections: [
      {
        heading: "Independent contractors",
        paragraphs: [
          ...marketplaceNature,
          "When you hire, you hire the independent contractor — not PPP. Scope, schedule, permits, and workmanship are between the homeowner and that contractor.",
        ],
      },
      {
        heading: "No false verification or escrow claims",
        paragraphs: [
          "PPP does not currently verify licenses, insurance, or workmanship. An admin approval to join the marketplace is not a license check, insurance audit, background check, or quality guarantee.",
          "Priority Verified is not live. PPP does not inspect work to code and does not bond jobs.",
          "PPP does not process, hold in escrow, or payout homeowner-to-contractor project money. Selecting a pro creates a booking record and a Connection Fee obligation. It does not charge a card and does not mean PPP is holding project funds.",
          "After the parties are connected through PPP, they communicate directly and arrange project payment themselves.",
        ],
      },
      {
        heading: "Connection Fees",
        paragraphs: [
          "PPP earns revenue from the $9.99 activation fee, a flat $4.99 Connection Fee when homeowners select contractors, and future Priority Pro subscriptions.",
          "Homeowners do not pay a PPP Connection Fee when they hire. Contractors owe a flat $4.99 Connection Fee per legitimate new connection, regardless of project value.",
          "The Connection Fee is the same for all connections: first-time, repeat, and hire-again all use the flat $4.99 rate. Priority Pro (Coming Soon) also uses $4.99.",
          "Connection Fees are for the marketplace service of connecting the parties. They are not project payment processing fees and are not based on the project value. PPP does not process the homeowner-to-contractor project payment.",
          "Connection Fee checkout is Coming Soon and is not live in this product. Fees are calculated and displayed; no live charges occur.",
        ],
      },
    ],
  },
  "community-guidelines": {
    slug: "community-guidelines",
    title: "Community & Review Guidelines",
    lastUpdated: LEGAL_LAST_UPDATED,
    attorneyReviewRequired: true,
    sections: [
      {
        heading: "Who may review",
        paragraphs: [
          "Homeowners may review the contractor, and contractors may review the homeowner, only after a completed PPP job between those two parties.",
          "You may not review yourself, invent a job id, leave a second review from the same side on the same job, or submit a review for a job that is not completed.",
        ],
      },
      {
        heading: "What a review may contain",
        paragraphs: [
          "Reviews use 1–5 stars and an optional written comment. Write about the actual job: communication, punctuality, cleanliness, and whether the agreed work was done.",
          "Do not include phone numbers, emails, links, or social handles in reviews, project text, or estimates. Contact is shared after the parties are connected through PPP.",
          "Do not post threats, hate, sexual content involving minors, or content you do not have the right to share.",
        ],
      },
      {
        heading: "How ratings are used",
        paragraphs: [
          "Public contractor ratings come only from eligible completed PPP jobs. Client-side star math is not trusted. Removing a review from the rating calculation is an admin action after a dispute.",
          "If an eligible average is below 4.00 after at least 5 completed-job reviews, new marketplace participation may be suspended. Exactly 4.00 does not suspend.",
        ],
      },
    ],
  },
  "dispute-policy": {
    slug: "dispute-policy",
    title: "Dispute Policy",
    lastUpdated: LEGAL_LAST_UPDATED,
    attorneyReviewRequired: true,
    sections: [
      {
        heading: "What you can dispute",
        paragraphs: [
          "From Account → Disputes you may report a fraudulent review, an inaccurate review, or a rating suspension.",
          "Each dispute stores a category, your explanation, the optional review id, timestamps, and a status: Open, Under review, Resolved — upheld, Resolved — removed from rating, Resolved — adjusted, or Closed.",
        ],
      },
      {
        heading: "How PPP reviews a dispute",
        paragraphs: [
          "An admin may inspect the project, booking, review, parties, audit trail, and any evidence you uploaded. Admins cannot resolve their own dispute and cannot unsuspend themselves.",
          "Possible outcomes include upholding the review or suspension, removing a review from the rating calculation, adjusting the account (including reinstatement when the rating no longer meets the suspension rule), or closing the request.",
          "Dispute records and admin actions are kept. They are not silently rewritten.",
        ],
      },
      {
        heading: "Job disputes",
        paragraphs: [
          "A booking can also be marked disputed by a participant on an active or completed job. That is a job-status flag. It is not automatically a card refund, because live charges are not on.",
        ],
      },
    ],
  },
  "suspension-termination": {
    slug: "suspension-termination",
    title: "Account Suspension & Termination",
    lastUpdated: LEGAL_LAST_UPDATED,
    attorneyReviewRequired: true,
    sections: [
      {
        heading: "Rating suspension",
        paragraphs: [
          "If your eligible completed-job average is below 4.00 and you have at least 5 eligible reviews, PPP may suspend the account for ratings. Exactly 4.00 does not suspend. The unrounded average is used.",
          "A rating suspension is not a deletion. You keep history. You cannot start new marketplace work: contractors cannot take new jobs or send new estimates; homeowners cannot post new projects or hire. You will see a notice and may appeal.",
        ],
      },
      {
        heading: "Other account states",
        paragraphs: [
          "PPP may also deactivate, disable, or close an account for policy or legal reasons. A user may request deletion from Account settings.",
          "Deletion removes the account from the public directory and from new participation. Legal, financial, dispute, audit, and marketplace history are retained. Public contact fields are replaced with a generic deleted-account label. Deletion does not erase evidence of Connection Fees owed, reviews given or received, or dispute history.",
        ],
      },
      {
        heading: "Appeals",
        paragraphs: [
          "Use Account → Disputes to appeal a rating suspension or a review you believe is fraudulent or inaccurate. There is no self-service unsuspend button.",
        ],
      },
    ],
  },
};

export function legalDocument(slug: LegalSlug): LegalDocument {
  return LEGAL_DOCUMENTS[slug];
}

export const LEGAL_INDEX_INTRO =
  "These pages describe how Priority Property Pros works today. They need attorney review before launch and do not create features, verifications, or payment protections that are not built.";
