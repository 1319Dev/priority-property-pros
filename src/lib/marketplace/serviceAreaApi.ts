import { getSupabaseClient } from "../supabase/client";
import { normalizeZip } from "./completeness";
import {
  validateServiceRadiusDraft,
  type ServiceRadiusDraft,
} from "./serviceRadius";
import type { ServiceAreaMode } from "./types";

export type ZipPlace = {
  zip: string;
  city: string | null;
  state: string | null;
};

export type ServiceRadiusPreview = {
  ok: true;
  zip: string;
  city: string | null;
  state: string | null;
  zipCount: number;
  preview: string;
  publicLabel: string;
};

export type ServiceAreaWrite = {
  mode: ServiceAreaMode;
  center_zip: string;
  radius_miles: number;
  zip_codes: string[];
  label: string;
};

function requireClient() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function lookupZipPlace(zip: string): Promise<ZipPlace | null> {
  const normalized = normalizeZip(zip);
  if (!normalized || normalized.length !== 5) return null;
  const { data, error } = await requireClient()
    .from("zip_centroids")
    .select("zip, city, state_code")
    .eq("zip", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { zip: data.zip, city: data.city, state: data.state_code };
}

export async function previewServiceRadius(zip: string, radiusMiles: number): Promise<
  ServiceRadiusPreview | { ok: false; error: string }
> {
  const { data, error } = await requireClient().rpc("zip_service_area_preview", {
    p_zip: zip,
    p_radius_miles: radiusMiles,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, error: typeof row.error === "string" ? row.error : "Enter a valid US ZIP code." };
  }
  return {
    ok: true,
    zip: String(row.zip ?? zip),
    city: typeof row.city === "string" ? row.city : null,
    state: typeof row.state === "string" ? row.state : null,
    zipCount: Number(row.zip_count ?? 0),
    preview: String(row.preview ?? ""),
    publicLabel: String(row.public_label ?? ""),
  };
}

export async function prepareServiceAreaSave(input: {
  centerZip: string;
  radiusMiles: string;
  extraZips: string;
}): Promise<ServiceAreaWrite> {
  const draft = validateServiceRadiusDraft(input);
  if (!draft.ok) throw new Error(draft.error);
  const preview = await previewServiceRadius(draft.value.centerZip, draft.value.radiusMiles);
  if (!preview.ok) throw new Error(preview.error);
  for (const zip of draft.value.extraZips) {
    const place = await lookupZipPlace(zip);
    if (!place) throw new Error(`Unknown ZIP code ${zip}.`);
  }
  return serviceAreaWrite(draft.value, preview.publicLabel);
}

export function serviceAreaWrite(draft: ServiceRadiusDraft, label: string): ServiceAreaWrite {
  return {
    mode: draft.extraZips.length > 0 ? "ZIPS_AND_RADIUS" : "RADIUS",
    center_zip: draft.centerZip,
    radius_miles: draft.radiusMiles,
    zip_codes: draft.extraZips,
    label,
  };
}
