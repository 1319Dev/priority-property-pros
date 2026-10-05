import {
  directoryRowBadges,
  fetchPublicContractor,
  fetchPublicContractorDirectory,
  fetchPublicContractorPortfolio,
  fetchPublicContractorReviews,
  fetchPublicDirectoryAcceptingWork,
  type PublicDirectoryRpcRow,
} from "./api";
import {
  isFindAProVisible,
  publicDirectoryReviews,
  publicPortfolioItems,
  toFindAProCard,
  type FindAProCard,
  type FindAProProfile,
} from "./findAPro";
import { publicAboutText } from "./publicDirectory";
import { isExcludedPublicContractorId, isSmokeTesterText } from "./publicReviewFilters";

function acceptingMap(rows: Array<{ id: string; accepting_work: boolean }>): Map<string, boolean> {
  return new Map(rows.map((row) => [row.id, row.accepting_work === true]));
}

async function cardFromRow(
  row: PublicDirectoryRpcRow,
  acceptingWork: boolean | null,
): Promise<FindAProCard | null> {
  if (isExcludedPublicContractorId(row.id)) return null;
  if (isSmokeTesterText(row.display_label) || isSmokeTesterText(row.short_description)) return null;

  const ratingCount = row.rating_count ?? 0;
  const [reviewRows, portfolioRows] = await Promise.all([
    ratingCount > 0 ? fetchPublicContractorReviews(row.id).catch(() => []) : Promise.resolve([]),
    fetchPublicContractorPortfolio(row.id).catch(() => []),
  ]);

  return toFindAProCard({
    id: row.id,
    displayLabel: row.display_label,
    primaryTrade: row.primary_trade,
    categories: row.categories ?? (row.primary_trade ? [row.primary_trade] : []),
    serviceArea: row.service_area,
    yearsExperience: row.years_experience,
    badges: directoryRowBadges(row),
    shortDescription: row.short_description,
    acceptingWork,
    portfolio: publicPortfolioItems(portfolioRows),
    reviews: publicDirectoryReviews(reviewRows),
  });
}

export async function loadFindAProDirectory(): Promise<FindAProCard[]> {
  const [rows, availability] = await Promise.all([
    fetchPublicContractorDirectory(),
    fetchPublicDirectoryAcceptingWork().catch(() => []),
  ]);
  const accepting = acceptingMap(availability);
  const cards = await Promise.all(
    rows.map((row) => cardFromRow(row, accepting.get(row.id) ?? null)),
  );
  return cards.filter((card): card is FindAProCard => Boolean(card));
}

export async function loadFindAProStorefront(id: string): Promise<FindAProProfile | null> {
  if (!isFindAProVisible({ id, approvalStatus: "APPROVED", accountStatus: "ACTIVE" })) return null;
  const row = await fetchPublicContractor(id);
  if (!row) return null;
  let acceptingWork: boolean | null = null;
  try {
    const availability = await fetchPublicDirectoryAcceptingWork();
    acceptingWork = acceptingMap(availability).get(id) ?? null;
  } catch {
    acceptingWork = null;
  }
  const card = await cardFromRow(row, acceptingWork);
  if (!card) return null;
  return {
    ...card,
    about: publicAboutText(row.about, card.shortDescription),
  };
}
