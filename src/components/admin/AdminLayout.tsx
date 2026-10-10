import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BrandLoader } from "../brand/BrandLoader";
import { SUPPORT_EMAIL } from "../../data/brand";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AdminLayout({
  pendingApprovals,
  children,
}: {
  pendingApprovals: number;
  children?: ReactNode;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreFocus = useRef(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  function closeDrawer(options?: { restoreFocus?: boolean }) {
    restoreFocus.current = Boolean(options?.restoreFocus);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (drawerOpen) return undefined;
    if (restoreFocus.current) {
      restoreFocus.current = false;
      menuButtonRef.current?.focus();
    }
    return undefined;
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const root = drawerRef.current;
    const focusables = () =>
      [...(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.tabIndex !== -1);
    focusables()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer({ restoreFocus: true });
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="paper-grain min-h-dvh bg-cream-50 text-ink-900">
      <div className="fixed inset-y-0 left-0 z-20 hidden w-16 border-r border-forest-950/40 bg-forest-800 md:flex lg:w-64">
        <AdminSidebar pendingApprovals={pendingApprovals} />
      </div>

      <div className="flex min-h-dvh min-w-0 flex-col md:pl-16 lg:pl-64">
        <AdminTopBar pathname={location.pathname} onOpenMenu={() => setDrawerOpen(true)} menuButtonRef={menuButtonRef} />
        <main id="main" className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Suspense fallback={<BrandLoader layout="section" label="Loading…" />}>{children ?? <Outlet />}</Suspense>
        </main>
        <p className="mx-auto w-full max-w-6xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-ink-500 sm:px-6">
          <a className="font-semibold text-forest-800 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-forest-950/50"
            aria-label="Close admin menu"
            onClick={() => closeDrawer({ restoreFocus: true })}
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 left-0 flex w-[min(18rem,calc(100vw-3rem))] flex-col bg-forest-800 pt-safe shadow-2xl"
          >
            <h2 id={titleId} className="sr-only">
              Admin menu
            </h2>
            <AdminSidebar
              variant="drawer"
              pendingApprovals={pendingApprovals}
              onNavigate={() => closeDrawer()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
