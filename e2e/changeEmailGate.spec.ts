import { expect, test } from "@playwright/test";

const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const paths = ["/app/customer/account", "/app/pro/account", "/app/admin/account"];

test.describe("signed-out account routes return to sign-in", () => {
  for (const viewport of widths) {
    for (const path of paths) {
      test(`${path} at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
        const box = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
      });
    }
  }
});
