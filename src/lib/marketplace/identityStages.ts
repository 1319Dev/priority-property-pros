/**
 * Marketplace identity / contact stages.
 *
 * This PR implements Stage 1 (public anonymized browse) and documents Stages 2–4.
 * It does not unlock contractor identity or contact after the $9.99 signup.
 * Contact entitlement after hire is PR #14 — do not merge or rewrite that work here.
 */

export const IDENTITY_STAGES = [
  {
    id: "public_visitor",
    title: "Public visitor",
    implemented: true,
    visible: [
      "Anonymized display label (trade + generic title, e.g. Approved Handyman Pro)",
      "General trade / categories",
      "General service area (e.g. Houston Area) — not a street address or ZIP list",
      "Aggregate PPP rating and verified review count only when real reviews exist",
      "Earned approval / credential badges with generic labels (Approved Pro, License reviewed)",
      "Years of experience when provided",
      "Short non-identifying description (contact-stripped; generic fallback otherwise)",
      "Manually screened PUBLIC_SAFE portfolio captions only — original files and filenames stay private",
    ],
    hidden: [
      "Contractor / business / legal name",
      "Phone, email, website, social",
      "Exact business address, lat/lng",
      "External review links",
      "License numbers and other trivially identifying credential text",
      "Branded logos, avatar photos, truck photos, and unscreened portfolio",
      "Identifying captions, file names, and photo metadata",
    ],
  },
  {
    id: "registered_homeowner",
    title: "Registered / activated homeowner ($9.99 signup)",
    implemented: false,
    visible: [
      "Same anonymized directory card as the public visitor",
      "Ability to post a project and receive estimates (account required)",
    ],
    hidden: [
      "Direct contractor phone / email / website / street address",
      "Googable business name on public browse (signup fee ≠ identity disclosure)",
    ],
  },
  {
    id: "estimate_received",
    title: "Estimate received",
    implemented: false,
    visible: [
      "Anonymized pro label, trades, general area, earned badges, years, PPP ratings",
      "Estimate price, line items, duration, availability, and notes (contact-stripped)",
    ],
    hidden: [
      "Phone, email, website, social, exact address",
      "Recommended: still hide legal/business name so the homeowner cannot Google around the hire",
    ],
  },
  {
    id: "hired_entitlement",
    title: "Hired + contact entitlement (PR #14)",
    implemented: false,
    visible: [
      "Full appropriate business identity for that hired customer↔contractor pair",
      "Phone / email / exact job address only when booking_contact_access is UNLOCKED or ADMIN_OVERRIDE",
    ],
    hidden: [
      "Unrelated contractors on the same project never inherit contact",
      "CONFIRMED status alone never unlocks privacy (see PR #14)",
    ],
  },
] as const;

export const RECOMMENDED_FULL_IDENTITY_STAGE = "hired_entitlement" as const;

export const RECOMMENDED_IDENTITY_REVEAL =
  "Reveal full business identity (legal/business name plus contact) only at Stage 4: the homeowner has hired that pro and PR #14 contact entitlement is UNLOCKED. Paying $9.99 never reveals identity. Stage 3 may show estimate economics under an anonymized label so a visitor still cannot Google the company before hire.";

export const IDENTITY_REVEAL_IMPLEMENTED = {
  publicVisitor: true,
  registeredHomeowner: false,
  estimateReceived: false,
  hiredEntitlement: false,
} as const;

/**
 * Remaining leak paths that are flagged, not built as surveillance.
 * Mitigated items are omitted.
 */
export const FLAGGED_LEAK_PATHS = [
  "Photo EXIF / GPS metadata is not stripped server-side; only manually screened PUBLIC_SAFE captions appear, using generic illustrations rather than original files.",
  "Original upload file names stay in private contractor-docs storage. Public portfolio rows never include storage_path or the original basename.",
  "Estimate line-item labels and change-order descriptions are not scanned (false positives on measurements such as 2x4). Notes, bios, headlines, project titles/descriptions, and estimate Q&A are scanned.",
  "Obfuscated contact (five five five…, name at gmail dot com) is not detected by design.",
  "Hire Again (completed prior job) currently returns business_name to that customer — post-hire, not gated on PR #14 entitlement. Left unchanged here.",
  "In-app messaging is not built; when it ships it must reuse assert_no_pre_hire_contact.",
  "Compare-estimates / booking detail still call the public directory RPC, so they show the anonymized label until Stage 4 is implemented in #14.",
] as const;
