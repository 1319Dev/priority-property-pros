import { isStagingAppEnv } from "../../lib/supabase/config";

export const STAGING_PREVIEW_COPY = "STAGING PREVIEW — not the live site";

export function StagingPreviewBanner({
  enabled = isStagingAppEnv(),
}: {
  enabled?: boolean;
}) {
  if (!enabled) return null;
  return (
    <div
      role="status"
      data-staging-preview-banner=""
      className="bg-gold-500 px-3 py-2 pt-safe text-center text-[0.7rem] font-semibold leading-snug text-forest-950 sm:text-sm"
    >
      {STAGING_PREVIEW_COPY}
    </div>
  );
}
