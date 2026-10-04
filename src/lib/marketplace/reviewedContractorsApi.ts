import {
  directoryRowBadges,
  fetchPublicContractor,
  fetchPublicContractorDirectory,
  fetchPublicContractorReviews,
  type PublicDirectoryRpcRow,
} from "./api";
import {
  isReviewBackedPublicContractor,
  publishableReviewSnippets,
  reviewedContractorAverage,
  type ReviewedContractorSnippet,
} from "./reviewedContractors";
import {
  toPublicContractorCard,
  toPublicSafeReview,
  type PublicContractorCard,
} from "./publicDirectory";

export type ReviewedContractorCard = PublicContractorCard & {
  reviews: ReviewedContractorSnippet[];
};

function cardFromDirectoryRow(row: PublicDirectoryRpcRow): PublicContractorCard {
  return toPublicContractorCard({
    id: row.id,
    displayLabel: row.display_label,
    primaryTrade: row.primary_trade,
    categories: row.categories ?? (row.primary_trade ? [row.primary_trade] : []),
    serviceArea: row.service_area,
    yearsExperience: row.years_experience,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
    badges: directoryRowBadges(row),
    shortDescription: row.short_description,
  });
}

function snippetsFromRows(
  rows: Array<{
    id: string;
    rating: number;
    body: string;
    category?: string | null;
    created_at?: string | null;
    homeowner_display?: string | null;
    verified?: boolean | null;
    response_body?: string | null;
    response_created_at?: string | null;
    response_updated_at?: string | null;
  }>,
): ReviewedContractorSnippet[] {
  return publishableReviewSnippets(
    rows
      .map((review) => {
        const safe = toPublicSafeReview({
          id: review.id,
          rating: review.rating,
          body: review.body,
          category: review.category,
          createdAt: review.created_at,
          homeownerDisplay: review.homeowner_display,
          verified: review.verified ?? undefined,
          responseBody: review.response_body,
          responseCreatedAt: review.response_created_at,
          responseUpdatedAt: review.response_updated_at,
        });
        if (!safe) return null;
        return {
          ...safe,
          verified: safe.verified,
        };
      })
      .filter((review): review is NonNullable<typeof review> => Boolean(review)),
  );
}

function withPublishableReviews(
  card: PublicContractorCard,
  reviews: ReviewedContractorSnippet[],
): ReviewedContractorCard | null {
  if (!isReviewBackedPublicContractor({ ...card, reviews })) return null;
  const published = publishableReviewSnippets(reviews);
  return {
    ...card,
    reviews: published,
    ratingCount: published.length,
    ratingAverage: reviewedContractorAverage(published),
  };
}

export async function loadReviewedContractors(): Promise<ReviewedContractorCard[]> {
  const rows = await fetchPublicContractorDirectory();
  const candidates = rows
    .map(cardFromDirectoryRow)
    .filter((card) => card.ratingCount > 0);

  const detailed = await Promise.all(
    candidates.map(async (card) => {
      const reviews = await fetchPublicContractorReviews(card.id).catch(() => []);
      return withPublishableReviews(card, snippetsFromRows(reviews));
    }),
  );

  return detailed.filter((card): card is ReviewedContractorCard => Boolean(card));
}

export async function loadReviewedContractor(id: string): Promise<{
  card: ReviewedContractorCard;
  about: string | null;
} | null> {
  const row = await fetchPublicContractor(id);
  if (!row) return null;
  const card = cardFromDirectoryRow(row);
  if (card.ratingCount <= 0) return null;
  const reviews = await fetchPublicContractorReviews(id).catch(() => []);
  const published = withPublishableReviews(card, snippetsFromRows(reviews));
  if (!published) return null;
  return { card: published, about: row.about ?? null };
}
