import type { ApprovalStatus, AccountStatus } from "../auth/types";
import { containsPreHireContact } from "./antiCircumvention";

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

export const PRIVATE_DIRECTORY_KEYS = [
  "businessName",
  "business_name",
  "legal_name",
  "email",
  "phone",
  "website",
  "website_url",
  "photoUrl",
  "photo_url",
  "avatar_url",
  "street",
  "street_line1",
  "street_line2",
  "address",
  "lat",
  "lng",
  "license_number",
  "licenseNumber",
  "insurance_carrier",
  "profile_id",
  "customer_id",
  "first_name",
  "last_name",
  "approved_by",
  "headline",
  "bio",
  "storage_path",
] as const;

export type PublicContractorBadge = {
  kind: string;
  label: string;
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

export function formatGeneralServiceArea(input: {
  serviceArea?: string | null;
  areaLabels?: Array<string | null | undefined>;
}): string {
  const named = input.serviceArea?.trim();
  if (named) {
    if (containsPreHireContact(named) || looksLikeStreetAddress(named) || /^\d{5}(-\d{4})?$/.test(named)) {
      return "Local service area";
    }
    return /\barea\b/i.test(named) ? named : `${named} Area`;
  }
  const labels = (input.areaLabels ?? [])
    .map((label) => label?.trim())
    .filter((label): label is string => Boolean(label))
    .filter((label) => !containsPreHireContact(label) && !looksLikeStreetAddress(label) && !/^\d{5}(-\d{4})?$/.test(label));
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
    if (!text || containsPreHireContact(text)) continue;
    return text.length > 180 ? `${text.slice(0, 177).trim()}…` : text;
  }
  return "Independent local contractor.";
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

export function liveContractorPath(id: string): string {
  return `/find-a-pro/${id}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
