import { useEffect, useState } from "react";
import { TextInput } from "../ui/Input";
import {
  RADIUS_MAX_MILES,
  RADIUS_MIN_MILES,
  RADIUS_PRESETS,
  RADIUS_SLIDER_STEP,
  formatMileCount,
  validateServiceRadiusDraft,
} from "../../lib/marketplace/serviceRadius";

export type RadiusPreviewLoader = (
  zip: string,
  radiusMiles: number,
) => Promise<{ ok: true; preview: string } | { ok: false; error: string }>;

export function ServiceRadiusEditor({
  centerZip,
  radiusMiles,
  extraZips,
  onCenterZipChange,
  onRadiusMilesChange,
  onExtraZipsChange,
  loadPreview,
}: {
  centerZip: string;
  radiusMiles: string;
  extraZips: string;
  onCenterZipChange: (value: string) => void;
  onRadiusMilesChange: (value: string) => void;
  onExtraZipsChange: (value: string) => void;
  loadPreview?: RadiusPreviewLoader;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const radiusNumber = radiusMiles.trim() === "" ? Number.NaN : Number(radiusMiles);
  const sliderValue = Number.isFinite(radiusNumber)
    ? Math.min(RADIUS_MAX_MILES, Math.max(RADIUS_MIN_MILES, radiusNumber))
    : 25;

  useEffect(() => {
    const draft = validateServiceRadiusDraft({ centerZip, radiusMiles, extraZips: "" });
    if (!draft.ok || !loadPreview) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void loadPreview(draft.value.centerZip, draft.value.radiusMiles)
      .then((result) => {
        if (cancelled) return;
        const extras = validateServiceRadiusDraft({ centerZip, radiusMiles, extraZips });
        if (!result.ok) {
          setPreview(null);
          setMessage(result.error);
          return;
        }
        setPreview(result.preview);
        setMessage(extras.ok ? null : extras.error);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [centerZip, radiusMiles, extraZips, loadPreview]);

  function showLocalValidation() {
    const draft = validateServiceRadiusDraft({ centerZip, radiusMiles, extraZips });
    setMessage(draft.ok ? null : draft.error);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Service area</legend>
      <TextInput
        label="Base ZIP"
        inputMode="numeric"
        autoComplete="postal-code"
        hint="The ZIP you work from, or your business address ZIP."
        value={centerZip}
        onChange={(event) => onCenterZipChange(event.target.value)}
        onBlur={showLocalValidation}
      />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Radius</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Service radius">
          {RADIUS_PRESETS.map((miles) => {
            const selected = radiusNumber === miles;
            return (
              <button
                key={miles}
                type="button"
                aria-pressed={selected}
                className={`min-h-12 rounded-full px-4 text-sm font-semibold ${
                  selected ? "bg-forest-800 text-cream-50" : "border border-forest-800/15 bg-cream-50 text-forest-800"
                }`}
                onClick={() => onRadiusMilesChange(String(miles))}
              >
                {miles} miles
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-sm text-ink-700">
          <span className="mb-1 block font-semibold text-forest-800">
            {radiusMiles.trim() ? `${formatMileCount(radiusNumber)} miles` : "Slide to choose miles"}
          </span>
          <input
            type="range"
            min={RADIUS_MIN_MILES}
            max={RADIUS_MAX_MILES}
            step={RADIUS_SLIDER_STEP}
            value={sliderValue}
            aria-label="Service radius miles"
            className="w-full"
            onChange={(event) => onRadiusMilesChange(event.target.value)}
          />
        </label>
      </div>
      {preview ? (
        <p className="text-sm text-ink-700" aria-live="polite">
          {preview}
        </p>
      ) : null}
      {message ? <p className="text-sm text-red-800">{message}</p> : null}
      <details className="rounded-2xl border border-forest-800/10 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-forest-800">Also include specific ZIP codes</summary>
        <div className="mt-3">
          <TextInput
            label="Extra ZIPs (optional)"
            hint="These still match even when they sit outside the radius. A previous ZIP list is kept here."
            value={extraZips}
            onChange={(event) => onExtraZipsChange(event.target.value)}
            onBlur={showLocalValidation}
          />
        </div>
      </details>
    </fieldset>
  );
}
