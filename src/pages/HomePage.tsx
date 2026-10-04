import { HomeBrowsePreview } from "../features/browse/BrowseVisuals";
import { ExampleComparison } from "../features/home/ExampleComparison";
import { ForContractors } from "../features/home/ForContractors";
import { Hero } from "../features/home/Hero";
import { HowItWorks } from "../features/home/HowItWorks";
import { HomePlatformReviews } from "../features/home/PlatformReviews";
import { PopularServices } from "../features/home/PopularServices";
import { ServiceVisuals } from "../features/home/ServiceVisuals";
import { SimplePricing } from "../features/home/SimplePricing";
import { TrustSafety } from "../features/home/TrustSafety";
import { VerifierComingSoon } from "../features/home/VerifierComingSoon";
import { WhyHomeowners } from "../features/home/WhyHomeowners";

export function HomePage() {
  return (
    <>
      <Hero />
      <ExampleComparison />
      <ServiceVisuals />
      <HomeBrowsePreview />
      <PopularServices />
      <HowItWorks />
      <VerifierComingSoon />
      <SimplePricing />
      <WhyHomeowners />
      <ForContractors />
      <HomePlatformReviews />
      <TrustSafety />
    </>
  );
}
