import { JobReference } from "./JobReference";
import { ButtonLink } from "../ui/Button";
import type { HiredJobCardModel, HiredJobChip } from "../../lib/marketplace/hiredJobs";

const CHIP_CLASS: Record<HiredJobChip, string> = {
  Hired: "bg-forest-800 text-cream-50",
  Confirmed: "bg-forest-800 text-cream-50 ring-2 ring-gold-500",
  "In progress": "bg-gold-500 text-forest-950",
  Completed: "border border-forest-800/20 bg-cream-100 text-forest-800",
};

export function HiredJobStatusChip({ chip }: { chip: HiredJobChip }) {
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em] ${CHIP_CLASS[chip]}`}>
      {chip}
    </span>
  );
}

export function HiredJobsSection({
  jobs,
  heading = "Hired jobs",
  showHeading = true,
  emptyTitle = "No hired jobs yet",
  emptyBody = "When a customer selects your estimate, the job shows up here with its PPP number.",
}: {
  jobs: HiredJobCardModel[];
  heading?: string;
  showHeading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  return (
    <section className="space-y-3" aria-label={heading}>
      {showHeading ? <h2 className="font-display text-2xl text-forest-800">{heading}</h2> : null}
      {jobs.length === 0 ? (
        <div className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
          <p className="font-semibold text-forest-800">{emptyTitle}</p>
          <p className="mt-1 text-sm text-ink-700">{emptyBody}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.bookingId} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <HiredJobStatusChip chip={job.chip} />
              <p className="mt-2 font-semibold text-forest-800">{job.title}</p>
              <JobReference value={job.referenceNumber} />
              <p className="text-sm text-ink-700">
                {job.customerFirstName} · {job.city}
              </p>
              <p className="mt-2 text-sm text-ink-700">Next: {job.nextStep}</p>
              <ButtonLink to={job.href} className="mt-4 min-h-14 w-full">
                Open job
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
