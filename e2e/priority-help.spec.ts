import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const harness = "http://127.0.0.1:5174/e2e/harness/index.html";

async function noHorizontalOverflow(page: Page) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function visibleBottomNav(page: Page, name: string): Promise<Locator> {
  const navs = page.getByRole("navigation", { name });
  const count = await navs.count();
  let match: Locator | null = null;
  for (let index = 0; index < count; index += 1) {
    const item = navs.nth(index);
    const box = await item.boundingBox();
    if (box && box.height > 20 && box.y > 200) match = item;
  }
  if (!match) throw new Error(`No visible ${name} navigation`);
  return match;
}

test("Priority Help stays above the public tab bar at 390 and 1280", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  const launcher = page.getByRole("button", { name: "Priority Help" });
  await expect(launcher).toBeVisible();
  const helpBox = await launcher.boundingBox();
  const navBox = await (await visibleBottomNav(page, "App")).boundingBox();
  expect(helpBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(intersects(helpBox!, navBox!)).toBe(false);
  expect(helpBox!.y + helpBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: "/opt/cursor/artifacts/screenshots/priority-help-closed-mobile-390.png",
    fullPage: false,
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "App" })).toBeHidden();
  await expect(launcher).toBeVisible();
  const desktopBox = await launcher.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.x + desktopBox!.width).toBeLessThanOrEqual(1281);
  expect(desktopBox!.y + desktopBox!.height).toBeLessThanOrEqual(901);
  await page.screenshot({
    path: "/opt/cursor/artifacts/screenshots/priority-help-closed-desktop-1280.png",
    fullPage: false,
  });
});

test("the help dialog traps focus on the public homepage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const launcher = page.getByRole("button", { name: "Priority Help" });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Priority Help" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Your message" })).toBeFocused();
  const talk = dialog.getByRole("button", { name: "Talk to Support" });
  await talk.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close Priority Help" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("Priority Help is above the dashboard tab bar and absent from admin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${harness}?as=customer#/app/customer`, { waitUntil: "domcontentloaded" });
  const launcher = page.getByRole("button", { name: "Priority Help" });
  await expect(launcher).toBeVisible();
  const helpBox = await launcher.boundingBox();
  const navBox = await (await visibleBottomNav(page, "Dashboard")).boundingBox();
  expect(helpBox && navBox && intersects(helpBox, navBox)).toBe(false);

  await page.goto(`${harness}?as=admin#/app/admin`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Priority Help" })).toHaveCount(0);
});

test("fixture states capture the open panel, an AI answer, Talk to Support, and the offline form", async ({ page }) => {
  const shots = [
    { scene: "open", width: 1280, height: 900, file: "priority-help-open-desktop-1280.png", text: /has not joined/i },
    { scene: "open", width: 390, height: 844, file: "priority-help-open-mobile-390.png", text: /has not joined/i },
    { scene: "answer", width: 1280, height: 900, file: "priority-help-ai-answer-1280.png", text: /\$9\.99/ },
    { scene: "answer", width: 390, height: 844, file: "priority-help-ai-answer-mobile-390.png", text: /\$4\.99/ },
    { scene: "escalate", width: 1280, height: 900, file: "priority-help-talk-to-support-1280.png", text: /PH-10001/ },
    { scene: "offline", width: 390, height: 844, file: "priority-help-offline-mobile-390.png", text: /Support is offline/i },
  ];

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${harness}?preview=help&scene=${shot.scene}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const dialog = page.getByRole("dialog", { name: "Priority Help" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(shot.text);
    await expect(dialog).not.toContainText(/is responding|contractor_fee|7%/i);
    if (shot.width < 768) {
      const helpBox = await dialog.boundingBox();
      const navBox = await (await visibleBottomNav(page, "App")).boundingBox();
      expect(helpBox && navBox && intersects(helpBox, navBox)).toBe(false);
    }
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: `/opt/cursor/artifacts/screenshots/${shot.file}`,
      fullPage: false,
    });
  }
});
