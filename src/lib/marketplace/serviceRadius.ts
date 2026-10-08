import { normalizeZip } from "./completeness";
import { haversineMiles } from "./matching";

/** Picker shortcuts. The slider can stop on any 5-mile step up to the cap. */
export const RADIUS_PRESETS = [5, 10, 25, 50, 75] as const;
export const RADIUS_MIN_MILES = 5;
export const RADIUS_MAX_MILES = 150;
export const RADIUS_SLIDER_STEP = 5;

/** Buckets used by infer_legacy_service_radii / sensible_radius_miles. */
export const INFERENCE_RADIUS_MILES = [5, 10, 25, 50, 75, 100, 150] as const;

export const NO_PROS_IN_AREA_YET =
  "No pros in your area yet. Your project is saved, and we'll keep looking.";

export type ServiceRadiusDraft = {
  centerZip: string;
  radiusMiles: number;
  extraZips: string[];
};

export function formatMileCount(miles: number): string {
  if (!Number.isFinite(miles)) return "";
  if (Number.isInteger(miles)) return String(miles);
  return String(Math.round(miles * 100) / 100);
}

export function isPublicRadiusLabel(value: string | null | undefined): boolean {
  return /^serves within\s+\d+(\.\d+)?\s+miles of\b/i.test(value?.trim() ?? "");
}

function placeLabel(input: { city?: string | null; state?: string | null; zip?: string | null }): string {
  const city = input.city?.trim();
  const state = input.state?.trim();
  if (city && state) return `${city}, ${state}`;
  const zip = normalizeZip(input.zip);
  if (zip && zip.length === 5) return zip;
  return "your base ZIP";
}

export function formatServesWithin(input: {
  miles: number;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return `Serves within ${formatMileCount(input.miles)} miles of ${placeLabel(input)}`;
}

export function formatRadiusPreview(input: {
  zipCount: number;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const noun = input.zipCount === 1 ? "ZIP code" : "ZIP codes";
  return `Covers about ${input.zipCount} ${noun} around ${placeLabel(input)}`;
}

export function findingProsNearLabel(
  city: string | null | undefined,
  state: string | null | undefined,
  zip?: string | null,
): string {
  const cityName = city?.trim();
  const stateName = state?.trim();
  if (cityName && stateName) return `Finding pros near ${cityName}, ${stateName}`;
  if (cityName) return `Finding pros near ${cityName}`;
  const normalized = normalizeZip(zip);
  if (normalized && normalized.length === 5) return `Finding pros near ${normalized}`;
  return "Finding pros near you";
}

export function sensibleRadiusMiles(maxMiles: number): number {
  const miles = Number.isFinite(maxMiles) ? Math.max(0, maxMiles) : 0;
  for (const bucket of INFERENCE_RADIUS_MILES) {
    if (miles <= bucket) return bucket;
  }
  return RADIUS_MAX_MILES;
}

/** Geographic median ZIP, then the smallest preset radius that covers the list. */
export function chooseBaseZip(
  points: Array<{ zip: string; lat: number; lng: number }>,
): { zip: string; maxMiles: number; radiusMiles: number } | null {
  const known = points.filter((point) => point.zip.length === 5);
  if (known.length === 0) return null;
  const meanLat = known.reduce((sum, point) => sum + point.lat, 0) / known.length;
  const meanLng = known.reduce((sum, point) => sum + point.lng, 0) / known.length;
  const ranked = [...known].sort((a, b) => {
    const left = haversineMiles(meanLat, meanLng, a.lat, a.lng) ?? Number.POSITIVE_INFINITY;
    const right = haversineMiles(meanLat, meanLng, b.lat, b.lng) ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return a.zip.localeCompare(b.zip);
  });
  const base = ranked[0];
  let maxMiles = 0;
  for (const point of known) {
    maxMiles = Math.max(maxMiles, haversineMiles(base.lat, base.lng, point.lat, point.lng) ?? 0);
  }
  return { zip: base.zip, maxMiles, radiusMiles: sensibleRadiusMiles(maxMiles) };
}

export function validateServiceRadiusDraft(input: {
  centerZip: string;
  radiusMiles: string;
  extraZips: string;
  knownZips?: ReadonlySet<string> | null;
}): { ok: true; value: ServiceRadiusDraft } | { ok: false; error: string } {
  const center = normalizeZip(input.centerZip);
  if (!center || center.length !== 5) {
    return { ok: false, error: "Enter a 5-digit base ZIP code." };
  }
  if (input.knownZips && !input.knownZips.has(center)) {
    return { ok: false, error: "Enter a valid US ZIP code." };
  }

  const radiusText = input.radiusMiles.trim();
  const radius = Number(radiusText);
  if (!radiusText || !Number.isFinite(radius)) {
    return { ok: false, error: "Choose a service radius." };
  }
  if (radius < 1 || radius > RADIUS_MAX_MILES) {
    return { ok: false, error: "Choose a radius between 1 and 150 miles." };
  }

  const extraZips: string[] = [];
  const seen = new Set<string>();
  for (const part of input.extraZips.split(/[\s,]+/)) {
    if (!part.trim()) continue;
    const zip = normalizeZip(part);
    if (!zip || zip.length !== 5) {
      return { ok: false, error: `Unknown ZIP code ${part.trim()}.` };
    }
    if (input.knownZips && !input.knownZips.has(zip)) {
      return { ok: false, error: `Unknown ZIP code ${zip}.` };
    }
    if (zip === center || seen.has(zip)) continue;
    seen.add(zip);
    extraZips.push(zip);
  }
  extraZips.sort();

  return { ok: true, value: { centerZip: center, radiusMiles: radius, extraZips } };
}

export function contractorAreaSummary(input: {
  label?: string | null;
  radiusMiles?: number | null;
  centerZip?: string | null;
  city?: string | null;
  state?: string | null;
  extraZips?: string[];
}): string {
  if (input.label && isPublicRadiusLabel(input.label)) return input.label.trim();
  if (input.radiusMiles != null && Number.isFinite(input.radiusMiles)) {
    return formatServesWithin({
      miles: input.radiusMiles,
      city: input.city,
      state: input.state,
      zip: input.centerZip,
    });
  }
  const zips = (input.extraZips ?? []).map((zip) => zip.trim()).filter(Boolean);
  if (zips.length) return zips.join(", ");
  if (input.centerZip?.trim()) return input.centerZip.trim();
  return "No service area yet.";
}
