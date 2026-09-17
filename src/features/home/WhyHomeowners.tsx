import { Container, SectionHeading } from "../../components/ui/Container";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING } from "../../data/pricing";

const points = [
  {
    title: "One simple place",
    body: "Stop collecting random numbers from porch flyers and group chats. Put the job where local pros actually look.",
  },
  {
    title: "One-time signup",
    body: `${HOMEPAGE_SIGNUP_HEADLINE} ${HOMEPAGE_SIGNUP_SUPPORTING} There is no PPP marketplace fee when you hire.`,
  },
  {
    title: "Local independents",
    body: "You hire a contractor in your community — not a national dispatch desk pretending to be your neighbor.",
  },
  {
    title: "Fair competition",
    body: "Pros compete for the project, not for the right to buy your phone number. You see who wants the work.",
  },
  {
    title: "You stay in charge",
    body: "PPP does not pick the contractor for you and does not perform the work. The hire is yours.",
  },
];

export function WhyHomeowners() {
  return (
    <section className="py-14 sm:py-16" aria-labelledby="why-heading">
      <Container>
        <SectionHeading
          eyebrow="Why homeowners use PPP"
          title="Built for property owners, not lead mills."
        />
        <h2 id="why-heading" className="sr-only">
          Why homeowners use PPP
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point.title} className="rounded-3xl bg-forest-800 px-5 py-6 text-cream-50">
              <h3 className="font-display text-2xl">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-200">{point.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
