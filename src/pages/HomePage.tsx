import { ForContractors } from "../features/home/ForContractors";
import { Hero } from "../features/home/Hero";
import { HowItWorks } from "../features/home/HowItWorks";
import { PopularServices } from "../features/home/PopularServices";
import { PriorityVerified } from "../features/home/PriorityVerified";
import { TrustSafety } from "../features/home/TrustSafety";
import { WhyHomeowners } from "../features/home/WhyHomeowners";

export function HomePage() {
  return (
    <>
      <Hero />
      <PopularServices />
      <HowItWorks />
      <WhyHomeowners />
      <ForContractors />
      <PriorityVerified />
      <TrustSafety />
    </>
  );
}
