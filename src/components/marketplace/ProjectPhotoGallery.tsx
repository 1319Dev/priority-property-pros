import { useEffect, useState } from "react";

export type GalleryPhoto = { id: string; url: string };

export function ProjectPhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = photos.find((photo) => photo.id === openId) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <section aria-label="Project photos" className="space-y-3">
      <h2 className="font-display text-2xl text-forest-800">Photos</h2>
      {photos.length === 0 ? <p className="text-sm text-ink-500">No photos yet.</p> : null}
      <ul className="grid grid-cols-2 gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              className="block w-full overflow-hidden rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-800"
              aria-label="Enlarge photo"
              onClick={() => setOpenId(photo.id)}
            >
              <img src={photo.url} alt="" className="h-28 w-full object-cover sm:h-36" />
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged project photo"
          className="fixed inset-0 z-50 flex flex-col bg-forest-950/90 p-4"
        >
          <button
            type="button"
            className="mb-3 min-h-11 self-end rounded-full bg-cream-50 px-4 text-sm font-semibold text-forest-800"
            aria-label="Close photo"
            onClick={() => setOpenId(null)}
          >
            Close
          </button>
          <img src={open.url} alt="Project photo" className="max-h-[80vh] w-full object-contain" />
        </div>
      ) : null}
    </section>
  );
}
