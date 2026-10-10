import { expect, test } from "@playwright/test";

const harness = "http://127.0.0.1:5174/e2e/harness/index.html?as=customer";
const shots = "/opt/cursor/artifacts/screenshots";

for (const width of [390, 1280]) {
  test(`block action and confirm dialog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto(`${harness}#/app/customer/bookings/book-1`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const button = page.getByRole("button", { name: "Don't match me with this pro again" });
    await expect(button).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/block-action-${width}.png`, fullPage: false });

    await button.click();
    const dialog = page.getByRole("dialog", { name: "Don't match with this pro again?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("A paid connection stays paid.");
    await page.screenshot({ path: `${shots}/block-confirm-${width}.png`, fullPage: false });
  });

  test(`blocked pros list at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto(`${harness}#/app/customer/account/blocked`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Blocked pros" })).toBeVisible();
    await expect(page.getByText("Approved Plumbing Pro")).toBeVisible();
    await expect(page.getByRole("button", { name: "Unblock" })).toBeVisible();
    await expect(page.getByText("Hidden Plumbing LLC")).toHaveCount(0);
    await expect(page.getByText("Northside Fence Co.")).toHaveCount(0);
    await page.screenshot({ path: `${shots}/blocked-pros-${width}.png`, fullPage: false });
  });
}
