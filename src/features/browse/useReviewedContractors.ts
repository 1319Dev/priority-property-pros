import { useCallback, useEffect, useRef, useState } from "react";
import { loadReviewedContractors, type ReviewedContractorCard } from "../../lib/marketplace/reviewedContractorsApi";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { PUBLIC_FETCH_TIMEOUT_MS, withTimeout } from "../../lib/withTimeout";

export function useReviewedContractors() {
  const configured = isSupabaseConfigured();
  const [cards, setCards] = useState<ReviewedContractorCard[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(configured);
  const generation = useRef(0);

  const retry = useCallback(() => {
    if (!configured) {
      setLoading(false);
      setFailed(false);
      setCards([]);
      return;
    }

    const generationId = ++generation.current;
    setLoading(true);
    setFailed(false);

    void withTimeout(loadReviewedContractors(), PUBLIC_FETCH_TIMEOUT_MS)
      .catch(() => withTimeout(loadReviewedContractors(), PUBLIC_FETCH_TIMEOUT_MS))
      .then((rows) => {
        if (generation.current !== generationId) return;
        setCards(rows);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (generation.current !== generationId) return;
        console.warn("Reviewed contractors could not be loaded", err);
        setCards([]);
        setFailed(true);
      })
      .finally(() => {
        if (generation.current === generationId) setLoading(false);
      });
  }, [configured]);

  useEffect(() => {
    retry();
    return () => {
      generation.current += 1;
    };
  }, [retry]);

  return { cards, failed, loading, retry };
}
