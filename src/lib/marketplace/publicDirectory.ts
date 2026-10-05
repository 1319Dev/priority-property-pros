import type { ApprovalStatus, AccountStatus } from "../auth/types";
import { containsPreHireContact } from "./antiCircumvention";
import { detectContactLeak } from "./contactLeak";

/** Public directory fields returned to anon. Keep in sync with list_public_directory_contractors. */
export const PUBLIC_CONTRACTOR_DIRECTORY_FIELDS = [
  "id",
  "displayLabel",
  "categories",
  "serviceArea",
  "yearsExperience",
  "ratingAverage",
  "ratingCount",
  "badges",
  "shortDescription",
] as const;

export const PUBLIC_CONTRACTOR_PROFILE_FIELDS = [
  ...PUBLIC_CONTRACTOR_DIRECTORY_FIELDS,
  "about",
  "services",
  "portfolio",
  "reviews",
] as const;

export const PRIVATE_DIRECTORY_KEYS = [
  "businessName",
  "business_name",
  "legal_name",
  "legalName",
  "email",
  "phone",
  "website",
  "website_url",
  "social",
  "instagram",
  "facebook",
  "photoUrl",
  "photo_url",
  "avatar_url",
  "logo_url",
  "street",
  "street_line1",
  "street_line2",
  "address",
  "lat",
  "lng",
  "coords",
  "license_number",
  "licenseNumber",
  "insurance_carrier",
  "external_review_url",
  "google_reviews_url",
  "profile_id",
  "customer_id",
  "first_name",
  "last_name",
  "approved_by",
  "headline",
  "bio",
  "storage_path",
  "filename",
  "original_filename",
] as const;

export const NEW_TO_PPP = "New to Priority Property Pros";

export const PORTFOLIO_PRIVACY_STATES = ["PUBLIC_SAFE", "PRIVATE", "REVIEW_REQUIRED"] as const;
export type PortfolioPrivacyState = (typeof PORTFOLIO_PRIVACY_STATES)[number];
export const DEFAULT_PORTFOLIO_PRIVACY: PortfolioPrivacyState = "REVIEW_REQUIRED";

export const DIRECTORY_SORTS = ["recommended", "highest_rated", "most_reviewed"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export type DirectoryFilters = {
  service?: string;
  area?: string;
  minRating?: number | null;
  minExperience?: number | null;
  sort?: DirectorySort;
};

export type PublicContractorBadge = {
  kind: string;
  label: string;
};

export type PublicSafePortfolioItem = {
  id: string;
  caption: string;
  sortOrder: number;
  illustration?: "fence" | "interior" | "yard";
};

export type PublicSafeReview = {
  id: string;
  rating: number;
  body: string;
  demo?: boolean;
};

export type PublicContractorCard = {
  id: string;
  displayLabel: string;
  photoInitials: string;
  categories: string[];
  serviceArea: string;
  yearsExperience: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  badges: PublicContractorBadge[];
  shortDescription: string;
};

export type PublicContractorProfile = PublicContractorCard & {
  about: string;
  services: string[];
  portfolio: PublicSafePortfolioItem[];
  reviews: PublicSafeReview[];
};

export function isDirectoryListedContractor(input: {
  approvalStatus: ApprovalStatus | null | undefined;
  accountStatus: AccountStatus | null | undefined;
}): boolean {
  return input.approvalStatus === "APPROVED" && input.accountStatus === "ACTIVE";
}

export function titleCaseTrade(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function anonymizedProLabel(input: {
  primaryTrade?: string | null;
  categories?: string[];
  demo?: boolean;
}): string {
  const raw = (input.primaryTrade?.trim() || input.categories?.find(Boolean)?.trim() || "Local").replace(/\s+/g, " ");
  const trade = titleCaseTrade(raw.replace(/\s+pro$/i, "").trim() || "Local");
  return `${input.demo ? "Example" : "Approved"} ${trade} Pro`;
}

export function initialsFromLabel(label: string): string {
  const parts = label
    .replace(/example|demo|approved|pro/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "PR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function looksLikeStreetAddress(value: string): boolean {
  return /\d+\s+\w+.*\b(street|st|ave|avenue|rd|road|blvd|lane|ln|dr|drive|ct|court|way|pkwy|parkway)\b/i.test(
    value,
  );
}

export function looksLikeFilename(value: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|pdf|mov|mp4)$/i.test(value.trim()) || /[/\\]/.test(value);
}

export function publicTextLooksUnsafe(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  return containsPreHireContact(text) || detectContactLeak(text).blocked;
}

export function formatGeneralServiceArea(input: {
  serviceArea?: string | null;
  areaLabels?: Array<string | null | undefined>;
}): string {
  const named = input.serviceArea?.trim();
  if (named) {
    if (publicTextLooksUnsafe(named) || looksLikeStreetAddress(named) || /^\d{5}(-\d{4})?$/.test(named)) {
      return "Local service area";
    }
    return /\barea\b/i.test(named) ? named : `${named} Area`;
  }
  const labels = (input.areaLabels ?? [])
    .map((label) => label?.trim())
    .filter((label): label is string => Boolean(label))
    .filter((label) => !publicTextLooksUnsafe(label) && !looksLikeStreetAddress(label) && !/^\d{5}(-\d{4})?$/.test(label));
  if (labels.length > 0) {
    const first = labels[0];
    return /\barea\b/i.test(first) ? first : `${first} Area`;
  }
  return "Local service area";
}

export function shortPublicDescription(headline: string | null | undefined, bio: string | null | undefined): string {
  const candidates = [headline, bio];
  for (const candidate of candidates) {
    const text = candidate?.trim().replace(/\s+/g, " ");
    if (!text || publicTextLooksUnsafe(text)) continue;
    return text.length > 180 ? `${text.slice(0, 177).trim()}…` : text;
  }
  return "Independent local contractor.";
}

export function publicAboutText(bio: string | null | undefined, headline: string | null | undefined): string {
  const candidates = [bio, headline];
  for (const candidate of candidates) {
    const text = candidate?.trim().replace(/\s+/g, " ");
    if (!text || publicTextLooksUnsafe(text)) continue;
    return text.length > 600 ? `${text.slice(0, 597).trim()}…` : text;
  }
  return "Independent local contractor. Contact is shared after you connect through Priority Property Pros.";
}

export function formatPublicRating(
  average: number | null,
  count: number,
  opts: { demo?: boolean } = {},
): string | null {
  if (average == null || count <= 0) return null;
  const unit = opts.demo ? "example reviews" : "verified PPP reviews";
  return `★ ${average.toFixed(1)} · ${count} ${unit}`;
}

export function publicRatingOrNew(
  average: number | null,
  count: number,
  opts: { demo?: boolean } = {},
): string {
  return formatPublicRating(average, count, opts) ?? NEW_TO_PPP;
}

export function genericCredentialBadges(badges: PublicContractorBadge[]): PublicContractorBadge[] {
  const seen = new Set<string>();
  const next: PublicContractorBadge[] = [];
  for (const badge of badges) {
    const kind = badge.kind.trim().toUpperCase() || "OTHER";
    if (kind === "APPROVED") {
      if (!seen.has("APPROVED")) {
        seen.add("APPROVED");
        next.push({ kind: "APPROVED", label: "Approved Pro" });
      }
      continue;
    }
    const label =
      kind === "LICENSE" ? "License reviewed" : kind === "INSURANCE" ? "Insurance reviewed" : "Credential reviewed";
    const key = `${kind}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ kind, label });
  }
  if (!seen.has("APPROVED")) next.unshift({ kind: "APPROVED", label: "Approved Pro" });
  return next;
}

export function stripPrivateDirectoryFields<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if ((PRIVATE_DIRECTORY_KEYS as readonly string[]).includes(key)) continue;
    next[key] = value;
  }
  return next;
}

export function toPublicContractorCard(input: {
  id: string;
  displayLabel?: string | null;
  primaryTrade?: string | null;
  categories: string[];
  serviceArea?: string | null;
  areaLabels?: Array<string | null | undefined>;
  yearsExperience?: number | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  badges?: PublicContractorBadge[];
  headline?: string | null;
  bio?: string | null;
  shortDescription?: string | null;
  demo?: boolean;
}): PublicContractorCard {
  const ratingCount = input.ratingCount ?? 0;
  const ratingAverage = ratingCount > 0 && input.ratingAverage != null ? Number(input.ratingAverage) : null;
  const displayLabel =
    input.displayLabel?.trim() ||
    anonymizedProLabel({ primaryTrade: input.primaryTrade, categories: input.categories, demo: input.demo });
  return {
    id: input.id,
    displayLabel,
    photoInitials: initialsFromLabel(displayLabel),
    categories: input.categories.filter(Boolean),
    serviceArea: formatGeneralServiceArea(input),
    yearsExperience: input.yearsExperience ?? null,
    ratingAverage,
    ratingCount,
    badges: genericCredentialBadges(input.badges ?? []),
    shortDescription: input.shortDescription?.trim()
      ? shortPublicDescription(input.shortDescription, null)
      : shortPublicDescription(input.headline, input.bio),
  };
}

export function toPublicContractorProfile(
  card: PublicContractorCard,
  extras: {
    about?: string | null;
    bio?: string | null;
    headline?: string | null;
    services?: string[];
    portfolio?: PublicSafePortfolioItem[];
    reviews?: PublicSafeReview[];
    demo?: boolean;
  } = {},
): PublicContractorProfile {
  const reviews = (extras.reviews ?? []).filter((review) => extras.demo || !review.demo);
  return {
    ...card,
    about: publicAboutText(extras.about, extras.bio ?? extras.headline ?? card.shortDescription),
    services: (extras.services ?? card.categories).filter(Boolean),
    portfolio: extras.portfolio ?? [],
    reviews,
  };
}

export function isPublicSafePortfolio(state: PortfolioPrivacyState | null | undefined): boolean {
  return state === "PUBLIC_SAFE";
}

export function publicSafePortfolioCaption(
  title: string | null | undefined,
  description: string | null | undefined,
): string {
  for (const candidate of [description, title]) {
    const text = candidate?.trim().replace(/\s+/g, " ");
    if (!text || publicTextLooksUnsafe(text) || looksLikeFilename(text)) continue;
    return text.length > 80 ? `${text.slice(0, 77).trim()}…` : text;
  }
  return "Screened project photo";
}

export function toPublicSafePortfolioItem(input: {
  id: string;
  title?: string | null;
  description?: string | null;
  privacyState?: PortfolioPrivacyState | null;
  sortOrder?: number | null;
  storagePath?: string | null;
  filename?: string | null;
  illustration?: PublicSafePortfolioItem["illustration"];
}): PublicSafePortfolioItem | null {
  if (!isPublicSafePortfolio(input.privacyState ?? DEFAULT_PORTFOLIO_PRIVACY)) return null;
  const item = {
    id: input.id,
    caption: publicSafePortfolioCaption(input.title, input.description),
    sortOrder: input.sortOrder ?? 0,
    illustration: input.illustration,
  };
  const leaked = JSON.stringify(item);
  if (input.storagePath && leaked.includes(input.storagePath)) return null;
  if (input.filename && leaked.includes(input.filename)) return null;
  return item;
}

export function realPppReviewStats(reviews: Array<{ rating: number; demo?: boolean; verified?: boolean }>): {
  ratingAverage: number | null;
  ratingCount: number;
} {
  const real = reviews.filter((review) => !review.demo && review.verified !== false);
  if (real.length === 0) return { ratingAverage: null, ratingCount: 0 };
  const sum = real.reduce((total, review) => total + review.rating, 0);
  return { ratingAverage: Math.round((sum / real.length) * 10) / 10, ratingCount: real.length };
}

export function toPublicSafeReview(input: {
  id: string;
  rating: number;
  body?: string | null;
  demo?: boolean;
  customerName?: string | null;
  bookingId?: string | null;
}): PublicSafeReview | null {
  if (input.rating < 1 || input.rating > 5) return null;
  const raw = input.body?.trim().replace(/\s+/g, " ") ?? "";
  const body = raw && !publicTextLooksUnsafe(raw) ? (raw.length > 280 ? `${raw.slice(0, 277).trim()}…` : raw) : "Verified PPP review.";
  const review: PublicSafeReview = {
    id: input.id,
    rating: input.rating,
    body: input.demo ? `${body} (Example review — not a real customer.)` : body,
    demo: input.demo,
  };
  const blob = JSON.stringify(review);
  if (input.customerName && blob.includes(input.customerName)) return { ...review, body: input.demo ? "Example review — not a real customer." : "Verified PPP review." };
  if (input.bookingId && blob.includes(input.bookingId)) return { ...review, body: input.demo ? "Example review — not a real customer." : "Verified PPP review." };
  return review;
}

export function recommendedDirectoryScore(card: DirectoryFilterable): number {
  const reviewed = card.ratingCount > 0 ? 1_000_000 : 0;
  const rating = (card.ratingAverage ?? 0) * 1_000;
  const count = card.ratingCount * 10;
  const years = card.yearsExperience ?? 0;
  return reviewed + rating + count + years;
}

export type DirectoryFilterable = Pick<
  PublicContractorCard,
  "categories" | "serviceArea" | "yearsExperience" | "ratingAverage" | "ratingCount" | "displayLabel"
>;

export function applyDirectoryFilters<T extends DirectoryFilterable>(cards: T[], filters: DirectoryFilters = {}): T[] {
  const service = filters.service?.trim().toLowerCase();
  const area = filters.area?.trim().toLowerCase();
  const minRating = filters.minRating ?? null;
  const minExperience = filters.minExperience ?? null;
  const filtered = cards.filter((card) => {
    if (service && !card.categories.some((category) => category.toLowerCase().includes(service))) return false;
    if (area && !card.serviceArea.toLowerCase().includes(area)) return false;
    if (minRating != null && ((card.ratingAverage ?? 0) < minRating || card.ratingCount <= 0)) return false;
    if (minExperience != null && (card.yearsExperience ?? 0) < minExperience) return false;
    return true;
  });
  const sort = filters.sort ?? "recommended";
  return [...filtered].sort((a, b) => {
    if (sort === "highest_rated") {
      const rating = (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
      if (rating !== 0) return rating;
      return b.ratingCount - a.ratingCount;
    }
    if (sort === "most_reviewed") {
      const count = b.ratingCount - a.ratingCount;
      if (count !== 0) return count;
      return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
    }
    const score = recommendedDirectoryScore(b) - recommendedDirectoryScore(a);
    if (score !== 0) return score;
    return a.displayLabel.localeCompare(b.displayLabel);
  });
}

export function publicBrowseBypassesContactEntitlement(): boolean {
  return false;
}

export function liveContractorPath(id: string): string {
  return `/find-a-pro/${id}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
