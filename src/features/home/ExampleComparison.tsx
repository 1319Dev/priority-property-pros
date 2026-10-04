import { useState } from "react";
import { Container } from "../../components/ui/Container";

const EXAMPLE_ESTIMATES = [
  {
    id: "example-handyman",
    label: "Example Handyman Pro",
    amount: "$180",
    scope: "Plane the door, adjust the hinges, and set the latch.",
    timeline: "About half a day",
    status: "Estimate received",
  },
  {
    id: "example-carpentry",
    label: "Example Carpentry Pro",
    amount: "$240",
    scope: "Trim the door and replace the strike plate.",
    timeline: "One weekday",
    status: "Estimate received",
  },
  {
    id: "example-repair",
    label: "Example Repair Pro",
    amount: "$150",
    scope: "Adjust the hinges and latch. No new door.",
    timeline: "This week",
    status: "Estimate received",
  },
] as const;

export function ExampleComparison() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="border-b border-forest-800/10 py-14 sm:py-16" aria-labelledby="example-heading">
      <Container>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Example</p>
        <h2 id="example-heading" className="mt-3 max-w-2xl font-display text-3xl font-semibold text-forest-800 sm:text-4xl">
          One project. Up to three estimates.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-700">
          Example only. Not real people, businesses, or prices. Choosing an estimate here does not send anything.
        </p>
        <article className="mt-8 rounded-3xl border border-forest-800/10 bg-cream-100/80 p-5 sm:p-6">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Example homeowner project</p>
          <h3 className="mt-2 font-display text-2xl text-forest-800">Interior door that sticks</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            One interior door rubs the frame. The example homeowner wants it to close and latch. Local service area.
            No street address is shown.
          </p>
        </article>
        <fieldset className="mt-4 min-w-0">
          <legend className="sr-only">Example estimates. Nothing is submitted.</legend>
          <div className="grid min-w-0 gap-4 lg:grid-cols-3">
            {EXAMPLE_ESTIMATES.map((estimate) => {
              const isSelected = selected === estimate.id;
              return (
                <div
                  key={estimate.id}
                  className={`min-w-0 rounded-3xl border bg-cream-50 p-5 ${
                    isSelected ? "border-forest-800" : "border-forest-800/10"
                  }`}
                >
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Example</p>
                  <h3 className="mt-2 font-display text-2xl text-forest-800">{estimate.label}</h3>
                  <p className="mt-3 font-display text-3xl text-forest-800">{estimate.amount}</p>
                  <dl className="mt-4 space-y-2 text-sm leading-relaxed text-ink-700">
                    <div>
                      <dt className="font-semibold text-forest-800">Scope</dt>
                      <dd>{estimate.scope}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-forest-800">Timeline</dt>
                      <dd>{estimate.timeline}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-forest-800">Status</dt>
                      <dd>{estimate.status}</dd>
                    </div>
                  </dl>
                  <label className="mt-5 flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-forest-800/15 px-3">
                    <input
                      type="radio"
                      name="example-estimate"
                      value={estimate.id}
                      checked={isSelected}
                      onChange={() => setSelected(estimate.id)}
                    />
                    <span className="text-sm font-semibold text-forest-800">
                      {isSelected ? "Selected in this example" : "Select"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
        <p className="mt-4 text-sm text-ink-500" role="status">
          {selected
            ? "Example only. This selection stays on the page and is not submitted."
            : "Select is an example control. It does not hire anyone."}
        </p>
      </Container>
    </section>
  );
}
