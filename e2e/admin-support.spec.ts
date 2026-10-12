import { expect, test } from "@playwright/test";

const harness = "http://127.0.0.1:5174/e2e/harness/index.html?as=admin";

test.use({ serviceWorkers: "block" });

test("admin support center screenshots", async ({ page }) => {
  const shots = [
    {
      path: "#/app/admin/support",
      width: 1280,
      height: 900,
      file: "admin-support-queues-1280.png",
      heading: "Support Center",
    },
    {
      path: "#/app/admin/support",
      width: 390,
      height: 844,
      file: "admin-support-queues-390.png",
      heading: "Support Center",
    },
    {
      path: "#/app/admin/support/conv-1",
      width: 1280,
      height: 900,
      file: "admin-support-conversation-1280.png",
      heading: "PH-10001",
    },
    {
      path: "#/app/admin/support/kb",
      width: 1280,
      height: 900,
      file: "admin-support-knowledge-1280.png",
      heading: "Knowledge",
    },
    {
      path: "#/app/admin/support/analytics",
      width: 1280,
      height: 900,
      file: "admin-support-analytics-1280.png",
      heading: "Analytics",
    },
  ];

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${harness}${shot.path}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: shot.heading })).toBeVisible();
    if (shot.path.endsWith("/kb")) {
      await page.getByRole("button", { name: /Payments and fees/ }).click();
      await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
    }
    if (shot.path.includes("conv-1")) {
      await expect(page.getByText("Customers never see this.")).toBeVisible();
      await expect(page.getByText(/has not joined/i)).toBeVisible();
    }
    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
    await page.screenshot({
      path: `/opt/cursor/artifacts/screenshots/${shot.file}`,
      fullPage: true,
    });
  }
});
