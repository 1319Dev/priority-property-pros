import { expect, test } from "@playwright/test";

const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

test.describe("signed-out sign-in stays on screen", () => {
  for (const viewport of widths) {
    test(`sign-in form fits at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/^password/i)).toBeVisible();
      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
    });
  }
});
