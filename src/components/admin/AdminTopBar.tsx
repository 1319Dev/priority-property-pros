import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { AccountMenu } from "../account/AccountMenu";
import { NotificationBell } from "../notifications/NotificationBell";
import { findAdminBookingsByReference } from "../../lib/marketplace/api";
import { AdminIcon } from "./AdminIcon";
import { adminSearchHits, type AdminSearchHit } from "./adminNav";
import { Breadcrumbs } from "./Breadcrumbs";

export function AdminTopBar({
  pathname,
  onOpenMenu,
  menuButtonRef,
}: {
  pathname: string;
  onOpenMenu: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-forest-800/10 bg-cream-50/95 pt-safe backdrop-blur-md">
      <div className="flex min-h-16 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <button
          ref={menuButtonRef}
          type="button"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-forest-800 hover:bg-forest-800/8 md:hidden"
          aria-label="Open admin menu"
          onClick={onOpenMenu}
        >
          <AdminIcon name="menu" />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumbs pathname={pathname} />
        </div>
        <div className="hidden min-w-0 flex-1 md:block md:max-w-sm lg:max-w-md">
          <AdminSearch />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
      <div className="px-3 pb-3 md:hidden">
        <AdminSearch />
      </div>
    </header>
  );
}

export function AdminSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hits = adminSearchHits(query);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  async function choose(hit: AdminSearchHit) {
    setError(null);
    if (hit.type === "section") {
      setOpen(false);
      setQuery("");
      navigate(hit.to);
      return;
    }
    setBusy(true);
    try {
      const found = await findAdminBookingsByReference(hit.reference);
      if (!found) {
        setError(`No job uses ${hit.reference}.`);
        setOpen(true);
        return;
      }
      setOpen(false);
      setQuery("");
      navigate(hit.to);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not search job references.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) {
      if (event.key === "ArrowDown" && hits.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[activeIndex];
      if (hit) void choose(hit);
    }
  }

  const activeId = hits[activeIndex] ? `${listId}-${hits[activeIndex].id}` : undefined;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search jobs and admin sections
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-full border border-forest-800/15 bg-cream-50 px-3">
        <AdminIcon name="search" className="h-4 w-4 shrink-0 text-ink-500" />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? activeId : undefined}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-forest-800 outline-none placeholder:text-ink-300"
          placeholder="Search PPP-#### or a section"
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {error ? (
        <p role="alert" className="px-3 pt-1 text-xs font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      {open && hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 z-40 mt-2 max-h-72 overflow-auto rounded-3xl border border-forest-800/10 bg-cream-50 p-2 shadow-xl"
        >
          {hits.map((hit, index) => (
            <li key={hit.id} role="presentation">
              <button
                id={`${listId}-${hit.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex min-h-11 w-full items-center rounded-2xl px-3 text-left text-sm font-semibold text-forest-800 ${
                  index === activeIndex ? "bg-cream-100" : "hover:bg-cream-100"
                }`}
                disabled={busy}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void choose(hit)}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
