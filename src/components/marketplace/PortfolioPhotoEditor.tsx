import { useEffect, useState } from "react";
import { PORTFOLIO_REVIEW_NOTE, portfolioPrivacyLabel } from "../../lib/marketplace/portfolioPrivacy";
import type { PortfolioPrivacyState } from "../../lib/marketplace/publicDirectory";

export type PortfolioEditorRow = {
  id: string;
  title: string;
  privacy_state: PortfolioPrivacyState;
  imageUrl?: string | null;
};

export function PortfolioPhotoEditor({
  rows,
  editing,
  onAddFile,
  onRemove,
  onSaveCaption,
}: {
  rows: PortfolioEditorRow[];
  editing: boolean;
  onAddFile: (file: File) => void;
  onRemove: (id: string) => void;
  onSaveCaption: (id: string, title: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700">
        {rows.length} photo{rows.length === 1 ? "" : "s"}. <span>{PORTFOLIO_REVIEW_NOTE}</span>
      </p>
      {editing ? (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Add portfolio photo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onAddFile(file);
          }}
        />
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream-100 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">
                    {portfolioPrivacyLabel(row.privacy_state)}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-forest-800">{row.title || "Photo"}</p>
                </div>
                {editing ? (
                  <button
                    type="button"
                    className="min-h-11 font-semibold text-danger-600"
                    onClick={() => onRemove(row.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {row.imageUrl ? (
                <img
                  src={row.imageUrl}
                  alt={row.title || "Portfolio photo"}
                  className="mt-3 h-40 w-full rounded-2xl object-cover"
                  onError={(event) => {
                    event.currentTarget.remove();
                  }}
                />
              ) : null}
              {editing ? (
                <CaptionField initial={row.title} onSave={(title) => onSaveCaption(row.id, title)} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CaptionField({ initial, onSave }: { initial: string; onSave: (title: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value.trim() || "Portfolio photo");
      }}
    >
      <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
        Caption
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3 text-sm font-normal normal-case tracking-normal text-ink-700"
        />
      </label>
      <button type="submit" className="mt-2 min-h-11 font-semibold text-forest-800">
        Save caption
      </button>
    </form>
  );
}
