import { useEffect, useState } from "react";
import { loadReviewedContractors, type ReviewedContractorCard } from "../../lib/marketplace/reviewedContractorsApi";
import { isSupabaseConfigured } from "../../lib/supabase/config";

export function useReviewedContractors() {
  const configured = isSupabaseConfigured();
  const [cards, setCards] = useState<ReviewedContractorCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void loadReviewedContractors()
      .then((rows) => {
        if (!cancelled) setCards(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load reviewed contractors.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return { cards, error, loading };
}
