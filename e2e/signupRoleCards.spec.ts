import { expect, test } from "@playwright/test";

const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

test.describe("signup role cards stay readable", () => {
  for (const viewport of widths) {
    test(`role labels wrap as phrases at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { name: /How will you use Priority Property Pros/i })).toBeVisible();

      const customer = page.getByRole("link", { name: /I need work done/i });
      const contractor = page.getByRole("link", { name: /I want to get hired/i });
      await expect(customer).toBeVisible();
      await expect(page.getByRole("heading", { name: "Before checkout" })).toBeVisible();

      const layout = await customer.evaluate((el) => {
        const label = el.querySelector("p");
        const style = getComputedStyle(el);
        const labelStyle = label ? getComputedStyle(label) : null;
        const lineHeight = labelStyle ? Number.parseFloat(labelStyle.lineHeight) : 0;
        const labelHeight = label?.getBoundingClientRect().height ?? 0;
        return {
          display: style.display,
          flexDirection: style.flexDirection,
          width: el.getBoundingClientRect().width,
          parentWidth: el.parentElement?.getBoundingClientRect().width ?? 0,
          lines: lineHeight > 0 ? labelHeight / lineHeight : 0,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });

      expect(layout.display).toBe("flex");
      expect(layout.flexDirection).toBe("column");
      expect(layout.width).toBeGreaterThan(240);
      expect(layout.parentWidth - layout.width).toBeLessThan(2);
      expect(layout.lines).toBeLessThan(1.6);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);

      const contractorLines = await contractor.evaluate((el) => {
        const label = el.querySelector("p");
        const labelStyle = label ? getComputedStyle(label) : null;
        const lineHeight = labelStyle ? Number.parseFloat(labelStyle.lineHeight) : 0;
        const labelHeight = label?.getBoundingClientRect().height ?? 0;
        return lineHeight > 0 ? labelHeight / lineHeight : 0;
      });
      expect(contractorLines).toBeLessThan(1.6);
    });
  }
});
