import { useNavigate } from "react-router-dom";
import { MARKETPLACE_NEED_LINE } from "../../data/brand";
import { FEATURED_SERVICE_VISUALS } from "../../data/marketingPhotos";
import { Container } from "../../components/ui/Container";

export function ServiceVisuals() {
  const navigate = useNavigate();

  return (
    <section className="border-b border-forest-800/10 py-12 sm:py-16" aria-labelledby="service-visuals-heading">
      <Container>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
          Homeowners & businesses
        </p>
        <h2
          id="service-visuals-heading"
          className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-tight text-forest-800 sm:text-4xl"
        >
          {MARKETPLACE_NEED_LINE}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-700">
          Fence work, lawn care, interior repairs, plumbing, electrical — post the job once. Independent local
          contractors compete fairly. You hire. They perform.
        </p>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED_SERVICE_VISUALS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  navigate(`/post-project?service=${encodeURIComponent(item.serviceName)}`);
                }}
                className="group flex min-h-44 w-full flex-col overflow-hidden rounded-3xl border border-forest-800/10 bg-cream-50 text-left shadow-[0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-gold-500"
              >
                <span className={`block h-2 w-full ${item.accent}`} aria-hidden="true" />
                <span className="flex flex-1 flex-col px-4 py-4">
                  <span className="font-display text-xl font-semibold text-forest-800">{item.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-700">{item.blurb}</span>
                  <span className="mt-auto pt-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-gold-700">
                    Post this project
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
