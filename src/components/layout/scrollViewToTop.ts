function collectScrollTargets(): Array<Window | Element> {
  const targets: Array<Window | Element> = [window];
  if (document.scrollingElement) targets.push(document.scrollingElement);
  targets.push(document.documentElement, document.body);
  const main = document.getElementById("main");
  if (main) targets.push(main);
  const root = document.getElementById("root");
  if (root) targets.push(root);
  return [...new Set(targets)];
}

/** Reset window and any overflow containers. Hash jumps to that id when present. */
export function scrollViewToTop(hash = ""): void {
  if (hash.length > 1) {
    try {
      const id = decodeURIComponent(hash.slice(1));
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
    } catch {
      // Invalid hash — fall through to top.
    }
  }

  for (const target of collectScrollTargets()) {
    if (target === window) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      continue;
    }
    const el = target as HTMLElement;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }
}
