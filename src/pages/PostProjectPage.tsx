import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { useToast } from "../hooks/useToast";

export function PostProjectPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const preset = params.get("q") ?? params.get("service") ?? "";

  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Post a project</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Not live yet.</h1>
        <p className="mt-4 text-lg text-ink-700">
          This form shows how posting will feel. Nothing is saved. There is no database in Phase 1.
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            toast.push("Project posting ships in a later phase. Nothing was sent.");
          }}
        >
          <label className="block" htmlFor="project-title">
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
              What do you need done?
            </span>
            <input
              id="project-title"
              name="title"
              defaultValue={preset}
              className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4"
              placeholder="Fence repaired before the weekend"
            />
          </label>
          <label className="block" htmlFor="project-notes">
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
              A little more detail
            </span>
            <textarea
              id="project-notes"
              name="notes"
              rows={4}
              className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
              placeholder="Property type, access, timing — whatever a local pro would need to know."
            />
          </label>
          <Button type="submit">Preview only — do not send</Button>
        </form>
        <p className="mt-6 text-sm">
          <Link to="/" className="font-semibold text-forest-800 underline">
            Back to the homepage
          </Link>
        </p>
      </Container>
    </section>
  );
}
