import type { AccountStatus, ApprovalStatus } from "../auth/types";
import { payingSignupFeeGrantsProjectContact } from "../signupFee/policy";
import { CONNECTION_FEE_CENTS } from "./types";
import { contactAccessAllowsReveal } from "./bookings";
import { isExcludedPublicContractorId, isSmokeTesterText } from "./publicReviewFilters";
import {
  applyDirectoryFilters,
  isDirectoryListedContractor,
  isUuid,
  publicBrowseBypassesContactEntitlement,
  publicTextLooksUnsafe,
  toPublicContractorCard,
  toPublicSafePortfolioItem,
  toPublicSafeReview,
  type DirectoryFilters,
  type PublicContractorBadge,
  type PublicContractorCard,
  type PublicSafePortfolioItem,
  type PublicSafeReview,
} from "./publicDirectory";
import { publishableReviewSnippets, reviewedContractorAverage } from "./reviewedContractors";

/**
 * Visibility before this change
 * ------------------------------
 * `list_public_directory_contractors` / `get_public_directory_contractor` already
 * return every APPROVED contractor on an ACTIVE account, with ratings left-joined
 * (zero when there are no verified customer reviews).
 * `/find-a-pro` then dropped those rows on the client: `loadReviewedContractors`
 * kept only `ratingCount > 0` and `isReviewBackedPublicContractor`. Zero-review
 * pros never appeared. The homepage preview still uses that review-backed loader.
 *
 * Visibility after
 * ----------------
 * `/find-a-pro` lists every directory RPC row. Ratings are optional.
 * Zero publishable reviews show "New on Priority Property Pros" and
 * "No reviews yet" — never stars or 0.0.
 * Unapproved and inactive contractors stay hidden because the RPC WHERE clause
 * is still APPROVED + ACTIVE. This file does not widen that gate.
 * The known smoke-tester profile id and smoke-tester text stay off the page.
 */

export const FIND_A_PRO_PATH = "/find-a-pro";
export const FIND_A_PRO_NAV_LABEL = "Find a Pro";
export const FIND_A_PRO_TITLE = "Find a Pro";
export const FIND_A_PRO_DOCUMENT_TITLE = "Find a Pro | Priority Property Pros";

export const NEW_ON_PPP = "New on Priority Property Pros";
export const NO_REVIEWS_YET = "No reviews yet";
export const PORTFOLIO_EMPTY = "No portfolio yet";
export const VERIFIED_PROJECT_LABEL = "Verified Project";

export const FIND_A_PRO_INTRO =
  "Approved, active contractors are listed here even when they have no reviews yet. New contractors do not show stars. A contractor pays a $4.99 connection fee to communicate with you. PPP does not take a cut of the job.";

export const FIND_A_PRO_EMPTY_TITLE = "No approved contractors yet";

export const FIND_A_PRO_EMPTY_BODY =
  "No approved, active contractor is on the public directory yet. This page stays empty until that happens. It will not fill in sample people. Post a project when you are ready to hire.";

export const FIND_A_PRO_LAYOUT_CLASS = "max-w-full overflow-x-hidden";

/** Fields a Find a Pro card or storefront is allowed to render. Contact stays off. */
export const FIND_A_PRO_PUBLIC_FIELDS = [
  "id",
  "displayLabel",
  "photoInitials",
  "primaryService",
  "otherServices",
  "categories",
  "serviceArea",
  "yearsExperience",
  "shortDescription",
  "about",
  "acceptingWork",
  "badges",
  "ratingAverage",
  "ratingCount",
  "ratingLabel",
  "newOnPlatform",
  "portfolio",
  "reviews",
] as const;

const FORBIDDEN_PUBLIC_KEYS = [
  "phone",
  "email",
  "street",
  "street_line1",
  "street_line2",
  "address",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "coords",
  "business_name",
  "businessName",
  "legal_name",
  "legalName",
  "website",
  "website_url",
  "license_number",
  "licenseNumber",
  "photo_url",
  "photoUrl",
  "avatar_url",
  "logo_url",
  "profile_id",
  "customer_id",
  "storage_path",
  "filename",
] as const;

export type FindAProReviewStatus = "any" | "reviewed" | "new";

export type FindAProFilters = {
  service?: string;
  area?: string;
  acceptingWorkOnly?: boolean;
  reviewStatus?: FindAProReviewStatus;
  minRating?: number | null;
};

export type FindAProReview = PublicSafeReview & {
  /** True only when the row came from the verified public reviews RPC. */
  verifiedProject: boolean;
};

export type FindAProCard = PublicContractorCard & {
  primaryService: string | null;
  otherServices: string[];
  acceptingWork: boolean | null;
  ratingLabel: string | null;
  newOnPlatform: boolean;
  portfolio: PublicSafePortfolioItem[];
  reviews: FindAProReview[];
};

export type FindAProProfile = FindAProCard & {
  about: string;
};

export function isFindAProVisible(input: {
  id?: string | null;
  approvalStatus: ApprovalStatus | null | undefined;
  accountStatus: AccountStatus | null | undefined;
  ratingCount?: number | null;
  displayLabel?: string | null;
  shortDescription?: string | null;
}): boolean {
  if (isExcludedPublicContractorId(input.id)) return false;
  if (isSmokeTesterText(input.displayLabel) || isSmokeTesterText(input.shortDescription)) return false;
  return isDirectoryListedContractor(input);
}

export function formatFindAProRating(average: number | null, count: number): string | null {
  if (average == null || count <= 0 || !Number.isFinite(average)) return null;
  const rounded = Math.round(average * 10) / 10;
  if (rounded <= 0) return null;
  const noun = count === 1 ? "review" : "reviews";
  return `${rounded.toFixed(1)} ★ · ${count} ${noun}`;
}

export function splitPublicServices(categories: string[], primaryTrade?: string | null): {
  primaryService: string | null;
  otherServices: string[];
} {
  const names = categories.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    const trade = primaryTrade?.trim();
    return { primaryService: trade || null, otherServices: [] };
  }
  return { primaryService: names[0], otherServices: names.slice(1) };
}

export function showVerifiedProjectBadge(review: {
  verifiedProject?: boolean;
  demo?: boolean;
}): boolean {
  return review.verifiedProject === true && review.demo !== true;
}

export function storefrontDocumentTitle(displayLabel: string | null | undefined): string {
  const label = displayLabel?.replace(/[\r\n]+/g, " ").trim() ?? "";
  if (!label || publicTextLooksUnsafe(label) || isSmokeTesterText(label)) return FIND_A_PRO_DOCUMENT_TITLE;
  return `${label} | Priority Property Pros`;
}

export function yearsInBusinessLabel(years: number | null | undefined): string | null {
  if (years == null || !Number.isFinite(years) || years < 0) return null;
  const rounded = Math.floor(years);
  return rounded === 1 ? "1 year in business" : `${rounded} years in business`;
}

export function publicPortfolioItems(
  rows: Array<{ id: string; caption?: string | null; title?: string | null; description?: string | null; sort_order?: number | null }>,
): PublicSafePortfolioItem[] {
  return rows
    .map((row) =>
      toPublicSafePortfolioItem({
        id: row.id,
        title: row.title,
        description: row.description ?? row.caption,
        privacyState: "PUBLIC_SAFE",
        sortOrder: row.sort_order,
      }),
    )
    .filter((item): item is PublicSafePortfolioItem => Boolean(item))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function publicDirectoryReviews(
  rows: Array<{ id: string; rating: number; body?: string | null; demo?: boolean }>,
): FindAProReview[] {
  const safe = rows
    .map((row) => toPublicSafeReview({ id: row.id, rating: row.rating, body: row.body, demo: row.demo }))
    .filter((review): review is PublicSafeReview => Boolean(review));
  return publishableReviewSnippets(safe).map((review) => ({
    ...review,
    verifiedProject: review.demo !== true,
  }));
}

export function toFindAProCard(input: {
  id: string;
  displayLabel?: string | null;
  primaryTrade?: string | null;
  categories?: string[] | null;
  serviceArea?: string | null;
  yearsExperience?: number | null;
  badges?: PublicContractorBadge[];
  shortDescription?: string | null;
  acceptingWork?: boolean | null;
  portfolio?: PublicSafePortfolioItem[];
  reviews?: FindAProReview[];
}): FindAProCard {
  const reviews = input.reviews ?? [];
  const ratingCount = reviews.length;
  const ratingAverage = ratingCount > 0 ? reviewedContractorAverage(reviews) : null;
  const categories = (input.categories ?? []).filter(Boolean);
  const services = splitPublicServices(categories, input.primaryTrade);
  const card = toPublicContractorCard({
    id: input.id,
    displayLabel: input.displayLabel,
    primaryTrade: input.primaryTrade,
    categories,
    serviceArea: input.serviceArea,
    yearsExperience: input.yearsExperience,
    ratingAverage,
    ratingCount,
    badges: input.badges,
    shortDescription: input.shortDescription,
  });
  const ratingLabel = formatFindAProRating(card.ratingAverage, card.ratingCount);
  return {
    ...card,
    ratingAverage: ratingLabel ? card.ratingAverage : null,
    ratingCount: ratingLabel ? card.ratingCount : 0,
    primaryService: services.primaryService,
    otherServices: services.otherServices,
    acceptingWork: input.acceptingWork ?? null,
    ratingLabel,
    newOnPlatform: ratingLabel == null,
    portfolio: input.portfolio ?? [],
    reviews,
  };
}

export function applyFindAProFilters<T extends FindAProCard>(cards: T[], filters: FindAProFilters = {}): T[] {
  const directoryFilters: DirectoryFilters = {
    service: filters.service,
    area: filters.area,
    minRating: filters.minRating,
    sort: "recommended",
  };
  return applyDirectoryFilters(cards, directoryFilters).filter((card) => {
    if (filters.acceptingWorkOnly && card.acceptingWork !== true) return false;
    if (filters.reviewStatus === "reviewed" && !card.ratingLabel) return false;
    if (filters.reviewStatus === "new" && card.ratingLabel) return false;
    return true;
  });
}

export function findAProPayloadLeaksContact(value: unknown): string[] {
  const leaks: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (node == null) return;
    if (typeof node === "string") {
      if (isUuid(node)) return;
      if (publicTextLooksUnsafe(node) || isSmokeTesterText(node)) leaks.push(path || "(text)");
      if (/\b\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/.test(node)) leaks.push(`${path || "(text)"}:coords`);
      return;
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if ((FORBIDDEN_PUBLIC_KEYS as readonly string[]).includes(key)) leaks.push(path ? `${path}.${key}` : key);
      walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(value, "");
  return leaks;
}

/** $9.99 activation never unlocks project contact. $4.99 remains the connection entitlement. */
export function activationUnlocksContact(): boolean {
  return payingSignupFeeGrantsProjectContact() || publicBrowseBypassesContactEntitlement();
}

export function connectionFeeCentsUnchanged(): boolean {
  return CONNECTION_FEE_CENTS === 499 && contactAccessAllowsReveal("UNLOCKED") && !contactAccessAllowsReveal("LOCKED");
}
