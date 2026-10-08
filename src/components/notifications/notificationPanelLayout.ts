/** Breakpoint matches Tailwind `sm` (640px): below it the bell uses a fixed sheet. */
export const NARROW_NOTIFICATION_QUERY = "(max-width: 639px)";

/**
 * Right-aligned dropdowns extend left from the bell. When that would pass the
 * left margin, return a negative `right` offset (px) that shifts the panel
 * back on screen. Width is capped at `100vw - 1.5rem`, so a 12px left inset
 * also keeps the right edge on screen.
 */
export function dropdownRightInset(panelLeft: number, margin = 12): number {
  if (!Number.isFinite(panelLeft) || panelLeft >= margin) return 0;
  return panelLeft - margin;
}
