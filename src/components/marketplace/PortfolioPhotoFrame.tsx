import { useState } from "react";

export function PortfolioPhotoFrame({
  src,
  alt,
  className = "mt-3 h-40 w-full rounded-2xl",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-2 border border-forest-800/10 bg-cream-200 px-3 text-ink-500`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 15.5 16 11l-4 3.2-2.2-1.7L3 17" />
        </svg>
        <span className="text-sm">Photo unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${className} object-cover`}
      onError={() => setFailedSrc(src)}
    />
  );
}
