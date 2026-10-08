import { useNavigate } from "react-router-dom";
import { MARKETPLACE_NEED_LINE } from "../../data/brand";
import { OFFICIAL_CATEGORY_CARDS } from "../../data/marketingPhotos";
import { MarketingPhoto } from "../../components/media/MarketingPhoto";
import { Container } from "../../components/ui/Container";
import { authAwarePostPath } from "../../lib/auth/publicEntry";
import { useAuth } from "../../lib/auth/useAuth";

export function ServiceVisuals() {
  const navigate = useNavigate();
  const { loading, account_type } = useAuth();
  const cards = OFFICIAL_CATEGORY_CARDS.filter((item) => Boolean(item.photoId));

  return (
    <section id="services" className="border-b border-forest-800/10 py-12 sm:py-16" aria-labelledby="services-heading">
      <Container>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
          Popular services
        </p>
        <h2
          id="services-heading"
          className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-tight text-forest-800 sm:text-4xl"
        >
          {MARKETPLACE_NEED_LINE}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-700">
          Fence work, lawn care, interior repairs, plumbing, electrical — post the job once. Independent local
          contractors compete fairly. You hire. They perform.
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (item.serviceName) params.set("service", item.serviceName);
                  else params.set("q", item.postQuery);
                  navigate(authAwarePostPath(`/post-project?${params.toString()}`, { loading, accountType: account_type }));
                }}
                className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-forest-800/10 bg-cream-50 text-left shadow-[0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-gold-500"
              >
                <span className="block aspect-[196/136] w-full overflow-hidden bg-forest-800/10">
                  <MarketingPhoto photo={item.photoId} sizes="(max-width: 640px) 46vw, 240px" />
                </span>
                <span className="flex flex-1 flex-col px-3 py-3 sm:px-4">
                  <span className="font-display text-lg font-semibold text-forest-800">{item.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-700">{item.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
