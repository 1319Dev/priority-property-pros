import { Link } from "react-router-dom";
import { adminBreadcrumbs } from "./adminNav";

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = adminBreadcrumbs(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-ink-500">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-ink-300">
                  /
                </span>
              ) : null}
              {crumb.to && !last ? (
                <Link to={crumb.to} className="truncate font-semibold text-forest-800 underline-offset-2 hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-semibold text-forest-800" aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
