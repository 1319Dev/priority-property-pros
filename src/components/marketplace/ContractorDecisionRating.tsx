import { Link } from "react-router-dom";
import { decisionRatingLines } from "../../lib/marketplace/contractorReviews";
import { liveContractorPath } from "../../lib/marketplace/publicDirectory";

export function ContractorDecisionRating({
  average,
  count,
  contractorId,
}: {
  average: number | null | undefined;
  count: number | null | undefined;
  contractorId: string;
}) {
  const lines = decisionRatingLines(average, count);
  if (!lines.hasRating) {
    return (
      <p className="mt-2 max-w-full text-sm font-medium text-forest-800">
        {lines.primary}
        {lines.secondary ? <span className="mt-1 block font-normal text-ink-700">{lines.secondary}</span> : null}
      </p>
    );
  }
  return (
    <p className="mt-2 max-w-full text-sm font-medium text-forest-800">
      <Link
        to={`${liveContractorPath(contractorId)}#reviews`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {lines.primary}
        <span className="sr-only"> Opens the review section in a new tab so this comparison stays put.</span>
      </Link>
    </p>
  );
}
