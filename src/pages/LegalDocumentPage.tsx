import { LegalMarkdown } from "../components/legal/LegalMarkdown";
import { Container } from "../components/ui/Container";
import { usePageTitle } from "../lib/seo/usePageTitle";

export function LegalDocumentPage({
  title,
  source,
}: {
  title: string;
  source: string;
}) {
  usePageTitle(`${title} | Priority Property Pros`);
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Legal</p>
        <LegalMarkdown source={source} />
      </Container>
    </section>
  );
}
