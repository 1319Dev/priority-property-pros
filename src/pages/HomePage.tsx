import { HomeBrowsePreview } from "../features/browse/BrowseVisuals";
import { MarketingGallery } from "../features/home/MarketingGallery";
import { ForContractors } from "../features/home/ForContractors";
import { Hero } from "../features/home/Hero";
import { HowItWorks } from "../features/home/HowItWorks";
import { PopularServices } from "../features/home/PopularServices";
import { PriorityVerified } from "../features/home/PriorityVerified";
import { SimplePricing } from "../features/home/SimplePricing";
import { TrustSafety } from "../features/home/TrustSafety";
import { WhyHomeowners } from "../features/home/WhyHomeowners";

export function HomePage() {
  return (
    <>
      <Hero />
      <HomeBrowsePreview />
      <PopularServices />
      <HowItWorks />
      <MarketingGallery />
      <SimplePricing />
      <WhyHomeowners />
      <ForContractors />
      <PriorityVerified />
      <TrustSafety />
    </>
  );
}
