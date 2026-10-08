import type { ServiceQuestion } from "../../lib/marketplace/types";

function selectedOptions(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function QuestionAnswerField({
  question,
  value,
  onChange,
}: {
  question: Pick<ServiceQuestion, "prompt" | "help_text" | "kind" | "options" | "is_required">;
  value: string;
  onChange: (value: string) => void;
}) {
  const selectClass = "min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4";
  return (
    <div>
      <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
        {question.prompt}
        {question.is_required ? " *" : ""}
      </p>
      {question.kind === "SINGLE_CHOICE" ? (
        <select className={selectClass} aria-label={question.prompt} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : question.kind === "BOOLEAN" ? (
        <select className={selectClass} aria-label={question.prompt} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : question.kind === "MULTI_CHOICE" && question.options.length > 0 ? (
        <ul className="space-y-2">
          {question.options.map((option) => {
            const checked = selectedOptions(value).has(option);
            return (
              <li key={option}>
                <label className="flex min-h-12 items-center rounded-2xl border border-forest-800/15 bg-cream-50 px-4">
                  <input
                    type="checkbox"
                    className="mr-3"
                    checked={checked}
                    onChange={() => {
                      const next = selectedOptions(value);
                      if (next.has(option)) next.delete(option);
                      else next.add(option);
                      onChange(question.options.filter((item) => next.has(item)).join(", "));
                    }}
                  />
                  {option}
                </label>
              </li>
            );
          })}
        </ul>
      ) : question.kind === "NUMBER" ? (
        <input
          className={selectClass}
          aria-label={question.prompt}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <textarea
          rows={3}
          aria-label={question.prompt}
          className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {question.help_text ? <p className="mt-1 text-sm text-ink-500">{question.help_text}</p> : null}
    </div>
  );
}
