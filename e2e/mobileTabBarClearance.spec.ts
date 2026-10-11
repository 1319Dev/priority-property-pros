import { expect, test } from "@playwright/test";

/**
 * At phone width the bottom tab bar is fixed over the page. Keyboard focus and
 * the end of every public page must stay clear of it.
 */
const routes = ["/", "/sign-up", "/find-a-pro", "/pricing", "/reviews", "/sign-up/customer"];

test.describe("mobile tab bar never hides content", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of routes) {
    test(`focus and page end stay above the tab bar on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
      const bar = page.locator('nav[aria-label="Mobile"], nav').filter({ has: page.locator("a") }).last();
      await expect(bar).toBeVisible();

      const barTop = async () =>
        page.evaluate(() => {
          const nav = [...document.querySelectorAll("nav")].find(
            (n) => getComputedStyle(n).position === "fixed" && n.getBoundingClientRect().bottom >= window.innerHeight - 1,
          );
          return nav ? nav.getBoundingClientRect().top : window.innerHeight;
        });

      const hidden: string[] = [];
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || !el.closest("main, footer")) return null;
          const r = el.getBoundingClientRect();
          return { label: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40), top: r.top, bottom: r.bottom };
        });
        if (!info) continue;
        const top = await barTop();
        if (info.top < 844 && info.bottom > top + 1) hidden.push(`${info.label} (${Math.round(info.bottom - top)}px under)`);
      }
      expect(hidden, "focused elements covered by the tab bar").toEqual([]);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const lowest = await page.evaluate(() =>
        Math.max(
          ...[...document.querySelectorAll("main a, main button, main p, footer a, footer p")]
            .filter((e) => e.getClientRects().length)
            .map((e) => e.getBoundingClientRect().bottom),
        ),
      );
      expect(lowest).toBeLessThanOrEqual(await barTop());
    });
  }
});
