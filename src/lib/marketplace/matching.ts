import { normalizeZip } from "./completeness";
import type { ServiceAreaMode } from "./types";

export type MatchingContractor = {
  id: string;
  account_type: "CONTRACTOR";
  account_status: "ACTIVE" | "PENDING" | "SUSPENDED" | "DISABLED" | "DELETED";
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  accepting_work: boolean;
  category_ids: string[];
  min_job_cents: number | null;
  max_job_cents: number | null;
  has_verified_credential: boolean;
  years_experience?: number | null;
  areas: {
    mode: ServiceAreaMode;
    center_zip: string | null;
    center_lat: number | null;
    center_lng: number | null;
    radius_miles: number | null;
    zip_codes: string[];
  }[];
};

export type MatchingProject = {
  category_id: string | null;
  zip_code: string | null;
  lat: number | null;
  lng: number | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  requires_verified_credential: boolean;
};

export function haversineMiles(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a))) * 100) / 100;
}

export function locationMatches(
  project: Pick<MatchingProject, "zip_code" | "lat" | "lng">,
  area: MatchingContractor["areas"][number],
): boolean {
  const zip = normalizeZip(project.zip_code);
  const areaZips = area.zip_codes.map((z) => normalizeZip(z)).filter((z): z is string => Boolean(z));
  if (zip && areaZips.includes(zip)) return true;
  if (zip && normalizeZip(area.center_zip) === zip) return true;
  if (area.mode === "RADIUS" || area.mode === "ZIPS_AND_RADIUS") {
    const miles = haversineMiles(project.lat, project.lng, area.center_lat, area.center_lng);
    if (miles != null && area.radius_miles != null && miles <= area.radius_miles) return true;
  }
  return false;
}

export function contractorEligibleForProject(
  contractor: MatchingContractor,
  project: MatchingProject,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (contractor.account_type !== "CONTRACTOR") return { ok: false, reasons: ["role"] };
  if (contractor.account_status !== "ACTIVE") return { ok: false, reasons: ["account_status"] };
  if (contractor.approval_status !== "APPROVED") return { ok: false, reasons: ["approval"] };
  if (!contractor.accepting_work) return { ok: false, reasons: ["availability"] };
  if (!project.category_id || !contractor.category_ids.includes(project.category_id)) {
    return { ok: false, reasons: ["category"] };
  }
  reasons.push("category", "account", "approval", "availability");

  if (!contractor.areas.some((area) => locationMatches(project, area))) {
    return { ok: false, reasons: ["location"] };
  }
  reasons.push("location");

  if (
    contractor.min_job_cents != null &&
    project.budget_max_cents != null &&
    project.budget_max_cents < contractor.min_job_cents
  ) {
    return { ok: false, reasons: ["job_size"] };
  }
  if (
    contractor.max_job_cents != null &&
    project.budget_min_cents != null &&
    project.budget_min_cents > contractor.max_job_cents
  ) {
    return { ok: false, reasons: ["job_size"] };
  }
  reasons.push("job_size");

  if (project.requires_verified_credential && !contractor.has_verified_credential) {
    return { ok: false, reasons: ["credentials"] };
  }
  if (project.requires_verified_credential) reasons.push("credentials");

  return { ok: true, reasons };
}

export function matchContractors(project: MatchingProject, contractors: MatchingContractor[]): MatchingContractor[] {
  return contractors.filter((c) => contractorEligibleForProject(c, project).ok);
}

/** Live AVAILABLE offers + participating accepts cannot exceed this. */
export const MAX_OPEN_OPPORTUNITY_OFFERS = 3;
export const OFFER_FAIRNESS_LOOKBACK_DAYS = 14;
export const OFFER_FAIRNESS_MAX_PENALTY = 24;

export const HOMEOWNER_OFFER_QUEUE_COPY =
  "Offered to up to 3 local pros. If someone skips, the next best-suited pro is invited. Names and contact stay private until a paid connection.";

export type OfferLoad = {
  sameCategoryRecentOffers: number;
  otherRecentOffers: number;
  openAvailableCount: number;
  lastOfferedAt: string | null;
};

export function locationFitScore(
  project: Pick<MatchingProject, "zip_code" | "lat" | "lng">,
  contractor: MatchingContractor,
): number {
  let best = 0;
  const zip = normalizeZip(project.zip_code);
  for (const area of contractor.areas) {
    const areaZips = area.zip_codes.map((z) => normalizeZip(z)).filter((z): z is string => Boolean(z));
    if (zip && (areaZips.includes(zip) || normalizeZip(area.center_zip) === zip)) {
      best = Math.max(best, 20);
      continue;
    }
    if (area.mode === "RADIUS" || area.mode === "ZIPS_AND_RADIUS") {
      const miles = haversineMiles(project.lat, project.lng, area.center_lat, area.center_lng);
      if (miles != null && area.radius_miles != null && miles <= area.radius_miles) {
        best = Math.max(best, miles <= area.radius_miles / 2 ? 12 : 8);
      }
    }
  }
  return best;
}

/** Mirrors project_contractor_fit_score. Ineligible contractors score 0. */
export function projectContractorFitScore(contractor: MatchingContractor, project: MatchingProject): number {
  if (!contractorEligibleForProject(contractor, project).ok) return 0;
  let score = 30 + 15 + 15;
  score += locationFitScore(project, contractor);
  if (contractor.has_verified_credential) score += 10;
  score += Math.min(Math.max(contractor.years_experience ?? 0, 0), 10);
  if (contractor.min_job_cents != null || contractor.max_job_cents != null) score += 5;
  return score;
}

export function contractorOfferFairnessPenalty(load: OfferLoad): number {
  const raw =
    load.sameCategoryRecentOffers * 8 + load.openAvailableCount * 4 + Math.max(load.otherRecentOffers, 0) * 2;
  return Math.min(OFFER_FAIRNESS_MAX_PENALTY, Math.max(0, raw));
}

export function effectiveOfferScore(fitScore: number, load: OfferLoad): number {
  return fitScore - contractorOfferFairnessPenalty(load);
}

export function compareOfferRank(
  a: { effectiveScore: number; lastOfferedAt: string | null; contractorId: string },
  b: { effectiveScore: number; lastOfferedAt: string | null; contractorId: string },
): number {
  if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
  if (a.lastOfferedAt == null && b.lastOfferedAt != null) return -1;
  if (a.lastOfferedAt != null && b.lastOfferedAt == null) return 1;
  if (a.lastOfferedAt && b.lastOfferedAt && a.lastOfferedAt !== b.lastOfferedAt) {
    return a.lastOfferedAt.localeCompare(b.lastOfferedAt);
  }
  return a.contractorId.localeCompare(b.contractorId);
}

export function openOfferSlotsNeeded(
  participating: number,
  liveAvailable: number,
  cap = MAX_OPEN_OPPORTUNITY_OFFERS,
): number {
  return Math.max(0, cap - participating - liveAvailable);
}

/** Next unused contractors from a fairness-ranked list. Already-offered ids are skipped. */
export function nextOfferContractorIds(
  rankedIds: string[],
  alreadyOfferedIds: Iterable<string>,
  needed: number,
): string[] {
  if (needed <= 0) return [];
  const taken = new Set(alreadyOfferedIds);
  const picked: string[] = [];
  for (const id of rankedIds) {
    if (picked.length >= needed) break;
    if (taken.has(id)) continue;
    picked.push(id);
  }
  return picked;
}

export function rankEligibleContractorsForOffers(
  project: MatchingProject,
  contractors: MatchingContractor[],
  loadByContractorId: Record<string, OfferLoad | undefined>,
): string[] {
  return matchContractors(project, contractors)
    .map((contractor) => {
      const load = loadByContractorId[contractor.id] ?? {
        sameCategoryRecentOffers: 0,
        otherRecentOffers: 0,
        openAvailableCount: 0,
        lastOfferedAt: null,
      };
      return {
        contractorId: contractor.id,
        effectiveScore: effectiveOfferScore(projectContractorFitScore(contractor, project), load),
        lastOfferedAt: load.lastOfferedAt,
      };
    })
    .sort(compareOfferRank)
    .map((row) => row.contractorId);
}
