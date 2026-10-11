import { useState } from "react";

const frameClass = "aspect-[4/3] h-auto w-full max-h-56 rounded-2xl sm:max-h-72";

export function PortfolioPhotoFrame({
  src,
  alt,
  loading = false,
  className = frameClass,
}: {
  src?: string | null;
  alt: string;
  /** True while a signed URL is still being requested. */
  loading?: boolean;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const pending = loading || (Boolean(src) && loadedSrc !== src && failedSrc !== src);

  if (loading && !src) {
    return (
      <div
        className={`${className} animate-pulse border border-forest-800/10 bg-cream-200`}
        role="status"
        aria-label="Loading portfolio photo"
      />
    );
  }

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
    <div className={`relative ${className}`}>
      {pending ? (
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-cream-200" role="status" aria-label="Loading portfolio photo" />
      ) : null}
      <img
        src={src}
        alt={alt}
        className="h-full w-full rounded-2xl object-cover"
        sizes="(max-width: 640px) 100vw, 50vw"
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
