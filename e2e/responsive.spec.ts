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

test("mocked Find a Pro directory and storefront stay inside 390 and 1280", async ({ page }) => {
  const shots = [
    { view: "directory", width: 390, height: 844, file: "find-a-pro-directory-390.png" },
    { view: "directory", width: 1280, height: 900, file: "find-a-pro-directory-1280.png" },
    { view: "storefront", width: 390, height: 844, file: "find-a-pro-storefront-390.png" },
    { view: "storefront", width: 1280, height: 900, file: "find-a-pro-storefront-1280.png" },
  ];
  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`http://127.0.0.1:5174/e2e/harness/index.html?preview=${shot.view}`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Fence Repair & Handyman pro in Conroe" })).toBeVisible();
    await expect(page.getByText("Serves within 25 miles of Conroe, TX", { exact: true })).toBeVisible();
    await expect(page.getByText("Plymate")).toHaveCount(0);
    if (shot.view === "directory") {
      await expect(page.getByText(/contact details stay private until you and a pro connect on a project/i)).toBeVisible();
    } else {
      await expect(page.getByText("No portfolio yet", { exact: true })).toHaveCount(1);
      await expect(page.getByText("No reviews yet", { exact: true })).toHaveCount(2);
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

const adminWidths = [320, 390, 768, 1024, 1280, 1920];

test.describe("admin command center stays inside the viewport", () => {
  for (const width of adminWidths) {
    test(`admin overview at ${width}px has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin", {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);

      const menu = page.getByRole("button", { name: "Open admin menu" });
      const adminNav = page.getByRole("navigation", { name: "Admin" });
      if (width < 768) {
        await expect(menu).toBeVisible();
        await expect(adminNav).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: "Dashboard" })).toHaveCount(0);
      } else {
        await expect(menu).toBeHidden();
        await expect(adminNav).toBeVisible();
        const approvals = adminNav.getByRole("link", { name: /Approvals/ });
        await expect(approvals).toBeVisible();
        if (width >= 1024) await expect(approvals).toContainText("Approvals");
      }

      const search = page.getByRole("combobox", { name: "Search jobs and admin sections" });
      await expect(search).toBeVisible();
      await expect(page.getByRole("button", { name: /^Notifications/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    });
  }

  test("phone drawer opens, traps focus, and closes from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin", {
      waitUntil: "domcontentloaded",
    });
    const menu = page.getByRole("button", { name: "Open admin menu" });
    await menu.click();
    const dialog = page.getByRole("dialog", { name: "Admin menu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Booking tools" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "People" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test("search jumps to a section and to a job reference", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin", {
      waitUntil: "domcontentloaded",
    });
    const search = page.getByRole("combobox", { name: "Search jobs and admin sections" });
    await search.fill("reviews");
    await page.getByRole("option", { name: "Reviews" }).click();
    await expect(page).toHaveURL(/#\/app\/admin\/reviews$/);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Reviews");
    await expect(page.getByRole("heading", { name: "Marketplace not connected" })).toBeVisible();

    await search.fill("PPP-1042");
    await page.getByRole("option", { name: "Open job PPP-1042" }).click();
    await expect(page).toHaveURL(/#\/app\/admin\/bookings\?ref=PPP-1042$/);
    await expect(page.getByRole("heading", { name: "Booking tools" })).toBeVisible();
    await expect(page.getByText("Replace a leaning cedar fence before the storm")).toBeVisible();
  });
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

const adminCleanupWidths = [390, 768, 1280];

test.describe("admin cleanup copy", () => {
  for (const width of adminCleanupWidths) {
    test(`booking tools at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
      await expect(page.getByText(/Payments are not live/i)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);
      await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin/bookings", {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { name: "Booking tools" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Confirm for testing (no charge)" })).toBeVisible();
      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
      if (process.env.PPP_ADMIN_SCREENSHOTS) {
        const name = width === 1280 ? "desktop" : width === 768 ? "tablet" : "phone";
        await page.screenshot({
          path: `/opt/cursor/artifacts/screenshots/pr-d-bookings-${name}.png`,
          fullPage: true,
        });
      }
    });
  }
});

const adminOverviewWidths = [320, 390, 768, 1024, 1280];

test.describe("admin overview stays within the viewport", () => {
  for (const width of adminOverviewWidths) {
    test(`overview at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin", {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
      await expect(page.getByText("$14.98").first()).toBeVisible();
      await expect(page.getByText("Not set up yet").first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Email prioritypropertypros@gmail.com/i })).toHaveAttribute(
        "href",
        "mailto:prioritypropertypros@gmail.com",
      );
      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth + 1);
      if (process.env.PPP_ADMIN_SCREENSHOTS && (width === 390 || width === 768 || width === 1280)) {
        const name = width === 1280 ? "desktop" : width === 768 ? "tablet" : "phone";
        await page.screenshot({
          path: `/opt/cursor/artifacts/screenshots/pr-c-overview-${name}.png`,
          fullPage: true,
        });
      }
    });
  }

  test("include-test switch responds to the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("http://127.0.0.1:5174/e2e/harness/index.html?as=admin#/app/admin", {
      waitUntil: "domcontentloaded",
    });
    const toggle = page.getByRole("checkbox", { name: "Include test accounts" });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("$24.97").first()).toBeVisible();
  });
});
