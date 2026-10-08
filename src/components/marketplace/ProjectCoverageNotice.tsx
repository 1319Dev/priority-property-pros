import { useEffect, useState } from "react";
import { StatusBanner } from "../ui/StatusBanner";
import { HOMEOWNER_OFFER_QUEUE_COPY } from "../../lib/marketplace/matching";
import { lookupZipPlace, type ZipPlace } from "../../lib/marketplace/serviceAreaApi";
import { findingProsNearLabel, NO_PROS_IN_AREA_YET } from "../../lib/marketplace/serviceRadius";
import type { ProjectStatus } from "../../lib/marketplace/types";

const HIDDEN: ProjectStatus[] = ["DRAFT", "CANCELLED", "CONTRACTOR_SELECTED"];

export function ProjectCoverageNotice({
  status,
  zip,
  city,
  state,
  resolvePlace = lookupZipPlace,
}: {
  status: ProjectStatus;
  zip: string | null;
  city?: string | null;
  state?: string | null;
  resolvePlace?: (zip: string) => Promise<ZipPlace | null>;
}) {
  const [place, setPlace] = useState<ZipPlace | null>(null);

  useEffect(() => {
    if (HIDDEN.includes(status)) return;
    let cancelled = false;
    void resolvePlace(zip ?? "")
      .then((next) => {
        if (!cancelled) setPlace(next);
      })
      .catch(() => {
        if (!cancelled) setPlace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status, zip, resolvePlace]);

  if (HIDDEN.includes(status)) return null;

  const title = findingProsNearLabel(place?.city ?? city, place?.state ?? state, place?.zip ?? zip);
  const uncovered = status === "MATCHING";

  return (
    <StatusBanner
      tone="info"
      title={title}
      body={uncovered ? NO_PROS_IN_AREA_YET : HOMEOWNER_OFFER_QUEUE_COPY}
    />
  );
}
