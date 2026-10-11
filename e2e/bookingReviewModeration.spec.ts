import { expect, test } from "@playwright/test";

const harness = "http://127.0.0.1:5174/e2e/harness/index.html";

for (const width of [320, 390]) {
  test(`customer can report the other party's review at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${harness}?as=customer&partyReview=1&hidden=1#/app/customer/bookings/book-1`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    const report = page.getByRole("button", { name: "Report review" });
    await expect(report).toBeVisible();
    await expect(report).toBeDisabled();
    await expect(page.getByText("Hidden from the public profile. Both of you can still see it here.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post public response" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Report reason" }).fill("This does not match the job.");
    await expect(report).toBeEnabled();
    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
  });
}

test("contractor response form fits a phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${harness}?as=contractor&partyReview=1#/app/pro/jobs/book-1`, {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => document.fonts.ready);
  const response = page.getByRole("textbox", { name: "Your response" });
  await expect(response).toBeVisible();
  await expect(page.getByRole("button", { name: "Report review" })).toBeVisible();
  await response.fill("Call me at 512-555-0199 tomorrow morning.");
  await page.getByRole("button", { name: "Post public response" }).click();
  await expect(page.getByText(/cannot include a phone number/i)).toBeVisible();
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
});

test("admin job review tab keeps a low rating until there is evidence", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${harness}?as=admin#/app/admin/reviews`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("tab", { name: "Job reviews" }).click();
  await expect(page.getByText("The gate was left unfinished and the old posts stayed in the yard.")).toBeVisible();
  await expect(page.getByText("The fence line is straight and the yard was cleaned up the same day.")).toBeVisible();
  await expect(page.getByRole("button", { name: /hide low ratings/i })).toHaveCount(0);
  const low = page.getByRole("listitem").filter({ hasText: "old posts stayed in the yard" });
  const reason = low.getByRole("textbox", { name: "Reason for 2 star Customer review" });
  const hide = low.getByRole("button", { name: "Hide review" });
  await reason.fill("just a poor one star score");
  await expect(low.getByText(/cannot be hidden only because of its rating/i)).toBeVisible();
  await expect(hide).toBeDisabled();
  await reason.fill("The description names a gate that was not part of this job.");
  await expect(hide).toBeEnabled();
  await hide.click();
  await expect(page.getByRole("dialog", { name: "Hide this review?" })).toBeVisible();
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
});
