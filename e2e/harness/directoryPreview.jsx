import { ContractorStorefront } from "../../src/features/findAPro/ContractorStorefront";
import { FindAProDirectory } from "../../src/features/findAPro/FindAProDirectory";
import { FIND_A_PRO_INTRO, FIND_A_PRO_TITLE } from "../../src/lib/marketplace/findAPro";

const card = {
  id: "11111111-1111-4111-8111-111111111111",
  displayLabel: "Fence Repair & Handyman pro in Conroe",
  photoInitials: "FC",
  primaryService: "Handyman",
  otherServices: ["Fence Repair"],
  categories: ["Fence Repair", "Handyman"],
  serviceArea: "Serves within 25 miles of Conroe, TX",
  yearsExperience: 15,
  shortDescription: "Fence and handyman work around Conroe.",
  acceptingWork: true,
  badges: [{ kind: "APPROVED", label: "Approved Pro" }],
  ratingAverage: null,
  ratingCount: 0,
  ratingLabel: null,
  newOnPlatform: true,
  portfolio: [],
  reviews: [],
};

const profile = {
  ...card,
  about: "Independent local contractor. Contact is shared after you connect through Priority Property Pros.",
};

const ratedCard = {
  ...card,
  id: "22222222-2222-4222-8222-222222222222",
  displayLabel: "Handyman pro in Houston",
  photoInitials: "HH",
  primaryService: "Handyman",
  otherServices: [],
  categories: ["Handyman"],
  serviceArea: "Serves within 25 miles of Houston, TX",
  ratingAverage: 5,
  ratingCount: 2,
  ratingLabel: "5.0 ★ · 2 reviews",
  newOnPlatform: false,
  reviews: [{ id: "r1", rating: 5, body: "Finished the indoor repair.", verifiedProject: true }],
};

export function DirectoryPreview({ view }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">{FIND_A_PRO_TITLE}</h1>
      {view === "storefront" ? (
        <div className="mt-8">
          <ContractorStorefront profile={profile} />
        </div>
      ) : (
        <>
          <p className="mt-4 text-base leading-relaxed text-ink-700">{FIND_A_PRO_INTRO}</p>
          <div className="mt-8">
            <FindAProDirectory cards={[card, ratedCard]} failed={false} loading={false} onRetry={() => undefined} />
          </div>
        </>
      )}
    </main>
  );
}
