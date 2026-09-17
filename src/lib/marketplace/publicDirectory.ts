import type { ApprovalStatus, AccountStatus } from "../auth/types";

/** Public directory fields. Keep in sync with contractor_public_* views. */
export const PUBLIC_CONTRACTOR_DIRECTORY_FIELDS = [
  "id",
  "businessName",
  "photoUrl",
  "categories",
  "serviceArea",
  "ratingAverage",
  "ratingCount",
  "badges",
  "shortDescription",
] as const;

export const PRIVATE_DIRECTORY_KEYS = [
  "email",
  "phone",
  "street",
  "street_line1",
  "street_line2",
  "address",
  "lat",
  "lng",
  "license_number",
  "insurance_carrier",
  "profile_id",
  "customer_id",
  "first_name",
  "last_name",
  "approved_by",
] as const;

export type PublicContractorBadge = {
  kind: string;
  label: string;
};

export type PublicContractorCard = {
  id: string;
  businessName: string;
  photoUrl: string | null;
  photoInitials: string;
  categories: string[];
  serviceArea: string;
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

export function initialsFromName(name: string): string {
  const parts = name
    .replace(/example|demo/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "PR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function formatGeneralServiceArea(input: {
  serviceArea?: string | null;
  areaLabels?: Array<string | null | undefined>;
  centerZip?: string | null;
  radiusMiles?: number | null;
}): string {
  const named = input.serviceArea?.trim();
  if (named) return named;
  const labels = (input.areaLabels ?? []).map((label) => label?.trim()).filter((label): label is string => Boolean(label));
  if (labels.length > 0) return labels.join(" · ");
  const zip = input.centerZip?.trim();
  if (zip && input.radiusMiles != null) return `About ${input.radiusMiles} miles of ${zip}`;
  if (zip) return `Near ${zip}`;
  return "Service area listed after onboarding";
}

export function shortPublicDescription(headline: string | null | undefined, bio: string | null | undefined): string {
  const text = (headline?.trim() || bio?.trim() || "Independent local contractor.").replace(/\s+/g, " ");
  return text.length > 180 ? `${text.slice(0, 177).trim()}…` : text;
}

export function formatPublicRating(average: number | null, count: number): string | null {
  if (average == null || count <= 0) return null;
  return `${average.toFixed(1)} · ${count} review${count === 1 ? "" : "s"}`;
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
  businessName: string;
  photoUrl?: string | null;
  categories: string[];
  serviceArea?: string | null;
  areaLabels?: Array<string | null | undefined>;
  centerZip?: string | null;
  radiusMiles?: number | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  badges?: PublicContractorBadge[];
  headline?: string | null;
  bio?: string | null;
}): PublicContractorCard {
  const ratingCount = input.ratingCount ?? 0;
  const ratingAverage = ratingCount > 0 && input.ratingAverage != null ? Number(input.ratingAverage) : null;
  return {
    id: input.id,
    businessName: input.businessName,
    photoUrl: safeHttpUrl(input.photoUrl ?? null),
    photoInitials: initialsFromName(input.businessName),
    categories: input.categories.filter(Boolean),
    serviceArea: formatGeneralServiceArea(input),
    ratingAverage,
    ratingCount,
    badges: (input.badges ?? []).map((badge) => ({ kind: badge.kind, label: badge.label })),
    shortDescription: shortPublicDescription(input.headline, input.bio),
  };
}

export function liveContractorPath(id: string): string {
  return `/find-a-pro/${id}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
