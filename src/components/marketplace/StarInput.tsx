export function StarInput({
  value,
  onChange,
  name = "overall-rating",
}: {
  value: number;
  onChange: (value: number) => void;
  name?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
        Overall rating
      </legend>
      <div className="flex max-w-full flex-wrap gap-2" role="radiogroup" aria-label="Overall rating from 1 to 5 stars">
        {[1, 2, 3, 4, 5].map((star) => {
          const checked = value === star;
          return (
            <label
              key={star}
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-3 text-lg ${
                checked ? "bg-gold-500 text-forest-950" : "border border-forest-800/15 bg-cream-100 text-forest-800"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name={name}
                value={star}
                checked={checked}
                onChange={() => onChange(star)}
              />
              <span aria-hidden="true">{star <= value && value > 0 ? "★" : "☆"}</span>
              <span className="sr-only">
                {star} star{star === 1 ? "" : "s"}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
