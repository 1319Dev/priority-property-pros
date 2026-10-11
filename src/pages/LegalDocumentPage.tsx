import { useEffect, useState } from "react";
import { LegalMarkdown } from "../components/legal/LegalMarkdown";
import { Container } from "../components/ui/Container";
import { usePageTitle } from "../lib/seo/usePageTitle";
import { getSupabaseClient } from "../lib/supabase/client";

export function LegalDocumentPage({
  title,
  source,
  slug,
}: {
  title: string;
  source: string;
  slug?: string;
}) {
  usePageTitle(`${title} | Priority Property Pros`);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancel = false;
    void supabase
      .from("agreements")
      .select("published_at")
      .eq("slug", slug)
      .eq("is_current", true)
      .eq("published", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancel && data?.published_at) setPublishedAt(data.published_at);
      });
    return () => {
      cancel = true;
    };
  }, [slug]);

  const publishedLabel = publishedAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(new Date(publishedAt))
    : null;

  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Legal</p>
        {publishedLabel ? (
          <p className="mt-3 text-sm text-ink-600">Published {publishedLabel}.</p>
        ) : null}
        <LegalMarkdown source={source} />
      </Container>
    </section>
  );
}
