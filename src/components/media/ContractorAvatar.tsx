import { BrandMark } from "../brand/Logo";
import { cn } from "../../utils/cn";

export const CONTRACTOR_PLACEHOLDER_LABEL =
  "Priority Property Pros placeholder. This contractor has not published a profile photo.";

export function ContractorAvatar({
  photoUrl,
  className,
  size = 48,
}: {
  photoUrl?: string | null;
  className?: string;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt="Uploaded contractor profile photo"
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={CONTRACTOR_PLACEHOLDER_LABEL}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-forest-800",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <BrandMark className="h-[62%] w-[62%]" decorative />
    </span>
  );
}
