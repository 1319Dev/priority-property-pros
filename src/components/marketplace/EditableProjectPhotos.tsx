export type EditablePhoto = { id: string; url?: string; storage_path: string };

export function EditableProjectPhotos({
  photos,
  busy,
  onRemove,
  onAdd,
}: {
  photos: EditablePhoto[];
  busy: null | "upload" | string;
  onRemove: (photo: EditablePhoto) => void;
  onAdd: (file: File) => void;
}) {
  const locked = busy !== null;
  return (
    <section className="space-y-3" aria-label="Project photos">
      <h2 className="font-display text-2xl text-forest-800">Photos</h2>
      {busy === "upload" ? (
        <p role="status" className="text-sm font-semibold text-forest-800">
          Uploading…
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="overflow-hidden rounded-2xl bg-cream-100">
            <img src={photo.url} alt="" className="h-28 w-full object-cover" />
            <button
              type="button"
              className="min-h-11 w-full text-sm font-semibold text-danger-600 disabled:opacity-60"
              disabled={locked}
              onClick={() => onRemove(photo)}
            >
              {busy === photo.id ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Add a photo"
        disabled={locked}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          onAdd(file);
        }}
      />
    </section>
  );
}
