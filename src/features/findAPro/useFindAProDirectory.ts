import { useCallback, useEffect, useRef, useState } from "react";
import { loadFindAProDirectory, loadFindAProStorefront } from "../../lib/marketplace/findAProApi";
import type { FindAProCard, FindAProProfile } from "../../lib/marketplace/findAPro";
import { isSupabaseConfigured } from "../../lib/supabase/config";

export function useFindAProDirectory() {
  const configured = isSupabaseConfigured();
  const [cards, setCards] = useState<FindAProCard[]>([]);
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

    void loadFindAProDirectory()
      .then((rows) => {
        if (generation.current !== generationId) return;
        setCards(rows);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (generation.current !== generationId) return;
        console.warn("Find a Pro directory could not be loaded", err);
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

export function useFindAProStorefront(id: string, enabled: boolean) {
  const configured = isSupabaseConfigured();
  const [profile, setProfile] = useState<FindAProProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(configured && enabled);

  useEffect(() => {
    if (!enabled || !configured) {
      setLoading(false);
      setProfile(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void loadFindAProStorefront(id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn("Contractor storefront could not be loaded", err);
          setProfile(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, enabled, id]);

  return { profile, failed, loading };
}
