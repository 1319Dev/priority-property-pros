import { Link, useParams } from "react-router-dom";
import { MarketingPhoto } from "../components/media/MarketingPhoto";
import { BrandLoader } from "../components/brand/BrandLoader";
import { PostProjectLink } from "../components/layout/PostProjectLink";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA } from "../data/brand";
import { MARKETING_SECTION_PHOTOS } from "../data/marketingPhotos";
import { PRICING_PATH } from "../data/pricing";
import { ContractorStorefront } from "../features/findAPro/ContractorStorefront";
import { FindAProDirectory } from "../features/findAPro/FindAProDirectory";
import { useFindAProDirectory, useFindAProStorefront } from "../features/findAPro/useFindAProDirectory";
import {
  FIND_A_PRO_DOCUMENT_TITLE,
  FIND_A_PRO_INTRO,
  FIND_A_PRO_LAYOUT_CLASS,
  FIND_A_PRO_PATH,
  FIND_A_PRO_TITLE,
  storefrontDocumentTitle,
} from "../lib/marketplace/findAPro";
import { isUuid } from "../lib/marketplace/publicDirectory";
import { usePageTitle } from "../lib/seo/usePageTitle";

export function FindAProPage() {
  const { cards, failed, loading, retry } = useFindAProDirectory();
  usePageTitle(FIND_A_PRO_DOCUMENT_TITLE);

  return (
    <section className={`py-8 sm:py-12 ${FIND_A_PRO_LAYOUT_CLASS}`}>
      <Container className="max-w-3xl">
        <div className="mb-8 h-52 w-full overflow-hidden rounded-3xl border border-forest-800/10 sm:h-64">
          <MarketingPhoto
            photo={MARKETING_SECTION_PHOTOS.findAProHeader}
            eager
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">{FIND_A_PRO_TITLE}</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-700 sm:text-lg">{FIND_A_PRO_INTRO}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <PostProjectLink to="/post-project">{CUSTOMER_CTA}</PostProjectLink>
          <ButtonLink to={PRICING_PATH} variant="outline">
            See pricing
          </ButtonLink>
        </div>
        <div className="mt-10">
          <FindAProDirectory cards={cards} failed={failed} loading={loading} onRetry={retry} />
        </div>
      </Container>
    </section>
  );
}

export function PublicContractorPage() {
  const { contractorId = "" } = useParams();
  const listedId = isUuid(contractorId);
  const { profile, failed, loading } = useFindAProStorefront(contractorId, listedId);
  usePageTitle(profile ? storefrontDocumentTitle(profile.displayLabel) : FIND_A_PRO_DOCUMENT_TITLE);

  if (loading) {
    return (
      <section className={`py-8 sm:py-12 ${FIND_A_PRO_LAYOUT_CLASS}`}>
        <Container className="max-w-3xl">
          <BrandLoader layout="section" label="Loading contractor…" />
        </Container>
      </section>
    );
  }

  if (failed) {
    return (
      <section className={`py-8 sm:py-12 ${FIND_A_PRO_LAYOUT_CLASS}`}>
        <Container className="max-w-xl">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Profile not loaded</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-700">
            This profile could not be loaded. You can try again in a moment.
          </p>
          <p className="mt-6">
            <Link to={FIND_A_PRO_PATH} className="inline-flex min-h-11 items-center font-semibold text-forest-800 underline">
              Back to Find a Pro
            </Link>
          </p>
        </Container>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className={`py-8 sm:py-12 ${FIND_A_PRO_LAYOUT_CLASS}`}>
        <Container className="max-w-xl">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Profile not listed</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-700">
            This contractor is not on the public directory. Only approved, active contractors are listed. Phone, email,
            and street address are not shown here.
          </p>
          <p className="mt-6">
            <Link to={FIND_A_PRO_PATH} className="inline-flex min-h-11 items-center font-semibold text-forest-800 underline">
              Back to Find a Pro
            </Link>
          </p>
        </Container>
      </section>
    );
  }

  return (
    <section className={`py-8 sm:py-12 ${FIND_A_PRO_LAYOUT_CLASS}`}>
      <Container className="max-w-3xl">
        <ContractorStorefront profile={profile} />
      </Container>
    </section>
  );
}
