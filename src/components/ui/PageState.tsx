import { EmptyState } from "../layout/DashboardShell";
import { Skeleton } from "./Skeleton";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={label}>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-3xl border border-danger-600/20 bg-cream-50 px-5 py-6" role="alert">
      <h2 className="font-display text-2xl text-forest-800">Something went wrong</h2>
      <p className="mt-2 text-sm text-ink-700">{message}</p>
      {onRetry ? (
        <button type="button" className="mt-4 min-h-12 font-semibold text-forest-800 underline" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function NotFoundState({ title = "Not found", body }: { title?: string; body: string }) {
  return <EmptyState title={title} body={body} />;
}
