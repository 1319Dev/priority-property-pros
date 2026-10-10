import { expect, test } from "@playwright/test";

const routes = ["/", "/how-it-works", "/find-a-pro", "/become-a-pro", "/pricing", "/faq", "/trust", "/contact", "/sign-in", "/sign-up", "/forgot-password"];
const widths = [320, 390, 768, 1280];

test.describe("public routes stay within the viewport", () => {
  for (const route of routes) {
    for (const width of widths) {
      test(`${route} at ${width}px has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        const box = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
      });
    }
  }
});

test("homepage hero headline stays in the first laptop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);

  const hero = page.locator("main section").first();
  const headline = hero.getByRole("heading", { level: 1 });
  const image = hero.getByRole("img", { name: /homeowners standing together/i });
  await expect(headline).toBeVisible();
  await expect(image).toBeVisible();
  await page.waitForFunction(() => {
    const photo = document.querySelector("main section img");
    return photo instanceof HTMLImageElement && photo.complete && photo.naturalWidth > 0;
  });

  const layout = await page.evaluate(() => {
    const section = document.querySelector("main section");
    const heading = section?.querySelector("h1")?.getBoundingClientRect();
    const photo = section?.querySelector("img");
    const box = photo?.getBoundingClientRect();
    const natural =
      photo instanceof HTMLImageElement && photo.naturalHeight > 0 ? photo.naturalWidth / photo.naturalHeight : null;
    return {
      viewportHeight: window.innerHeight,
      heading: heading ? { top: heading.top, bottom: heading.bottom } : null,
      image: box ? { top: box.top, width: box.width, height: box.height } : null,
      naturalAspect: natural,
    };
  });

  const cta = hero.getByRole("link", { name: /^post a project$/i });
  const ctaBox = await cta.boundingBox();

  expect(layout.heading).not.toBeNull();
  expect(layout.image).not.toBeNull();
  expect(ctaBox).not.toBeNull();
  expect(layout.heading!.top).toBeGreaterThanOrEqual(-1);
  expect(layout.heading!.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.image!.top).toBeGreaterThanOrEqual(-1);
  expect(layout.image!.top).toBeLessThan(layout.viewportHeight);
  expect(layout.image!.height).toBeGreaterThan(0);
  expect(ctaBox!.y).toBeGreaterThanOrEqual(-1);
  expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.naturalAspect).not.toBeNull();
  expect(layout.image!.width / layout.image!.height).toBeLessThanOrEqual(layout.naturalAspect! + 0.02);
});

test("signed-in header keeps the bell inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=customer#/app/customer", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => document.fonts.ready);
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toBeVisible();

  const layout = await page.evaluate(() => {
    const header = document.querySelector("header");
    const controls = header
      ? [...header.querySelectorAll("a, button")].flatMap((el) => {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return [];
          const rect = el.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return [];
          return [
            {
              label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
              left: rect.left,
              right: rect.right,
              height: rect.height,
            },
          ];
        })
      : [];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      controls,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.controls.some((control) => control.label.startsWith("Notifications"))).toBe(true);
  for (const control of layout.controls) {
    expect(control.left, control.label).toBeGreaterThanOrEqual(-1);
    expect(control.right, control.label).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(control.height, control.label).toBeGreaterThanOrEqual(44);
  }

  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(-1);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(320 + 1);
});
