import {
  isStagingPublicEnvironment,
  STAGING_PREVIEW_BANNER_BODY,
  STAGING_PREVIEW_BANNER_LABEL,
} from "../../lib/env/publicEnvironment";

export function StagingPreviewBanner({
  environment = import.meta.env.VITE_PUBLIC_ENVIRONMENT,
}: {
  environment?: string;
}) {
  if (!isStagingPublicEnvironment(environment)) return null;

  return (
    <div
      role="status"
      data-environment="staging"
      className="bg-gold-500 px-4 py-2 text-center text-sm font-semibold text-forest-950"
    >
      <p className="uppercase tracking-[0.18em]">{STAGING_PREVIEW_BANNER_LABEL}</p>
      <p className="mt-0.5 font-medium normal-case tracking-normal">{STAGING_PREVIEW_BANNER_BODY}</p>
    </div>
  );
}
