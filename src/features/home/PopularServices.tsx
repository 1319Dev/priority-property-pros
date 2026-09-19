import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SERVICES, type Service } from "../../data/services";
import { ProjectTypeTabBar, type ProjectTypeTabValue } from "../../components/marketplace/ProjectTypePicker";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Container, SectionHeading } from "../../components/ui/Container";
import { SIGNUP_FEE_PUBLIC_NOTE } from "../../data/pricing";
import { projectTypeTabForSlug } from "../../lib/marketplace/serviceCategoryGroups";

export function PopularServices() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Service | null>(null);
  const [tab, setTab] = useState<ProjectTypeTabValue>("all");
  const visible = useMemo(
    () => (tab === "all" ? SERVICES : SERVICES.filter((service) => projectTypeTabForSlug(service.id) === tab)),
    [tab],
  );

  return (
    <section className="py-14 sm:py-16" aria-labelledby="services-heading">
      <Container>
        <SectionHeading
          eyebrow="Popular services"
          title="Local jobs. Plain language."
          kicker={`Start with what you actually need done. These are the first service types on PPP — not a national call-center menu. ${SIGNUP_FEE_PUBLIC_NOTE}`}
        />
        <h2 id="services-heading" className="sr-only">
          Popular services
        </h2>
        <div className="mt-8">
          <ProjectTypeTabBar idPrefix="home-services" includeAll value={tab} onChange={setTab} />
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" id="home-services-panel" role="tabpanel" aria-labelledby={`home-services-tab-${tab}`}>
          {visible.map((service) => (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => setSelected(service)}
                className="flex min-h-24 w-full min-w-0 flex-col items-start rounded-2xl border border-forest-800/10 bg-cream-50 px-3 py-3 text-left shadow-[0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-gold-500 hover:bg-cream-100"
              >
                <span className="font-display text-base font-semibold text-forest-800">
                  {service.name}
                </span>
                <span className="mt-1 line-clamp-3 text-xs leading-snug text-ink-500">{service.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </Container>
      <BottomSheet
        open={Boolean(selected)}
        title={selected?.name ?? "Service"}
        onClose={() => setSelected(null)}
      >
        <p className="text-ink-700">{selected?.blurb}. Sign in as a customer to post this job. Local independents can then respond.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => {
              if (!selected) return;
              navigate(`/post-project?service=${encodeURIComponent(selected.name)}`);
            }}
          >
            Post this project
          </Button>
          <ButtonLink to="/find-a-pro" variant="outline">
            Find a pro
          </ButtonLink>
        </div>
      </BottomSheet>
    </section>
  );
}
