import type { ReactNode } from "react";

/**
 * Wide screens keep the list and the detail pane side by side.
 * Narrow screens show one of them, so the detail is its own screen.
 */
export function AdminMasterDetail({
  desktop,
  showList,
  list,
  detail,
  listLabel = "List",
  detailLabel = "Detail",
}: {
  desktop: boolean;
  showList: boolean;
  list: ReactNode;
  detail: ReactNode;
  listLabel?: string;
  detailLabel?: string;
}) {
  if (!desktop) {
    return <div className="min-w-0">{showList ? list : detail}</div>;
  }
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0" role="region" aria-label={listLabel}>
        {list}
      </div>
      <div
        className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
        role="region"
        aria-label={detailLabel}
      >
        {detail}
      </div>
    </div>
  );
}
