import { expect, test } from "@playwright/test";

// Runs the real canvas pipeline in Chromium on a JPEG fixture that carries GPS,
// camera make/model, a comment, and EXIF orientation 6 (rotate 90° clockwise).
const harness = "http://127.0.0.1:5174/e2e/harness/index.html?as=customer";

test("strips GPS and keeps the photo upright in a real browser", async ({ page }) => {
  await page.goto(harness, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const strip = await import("/src/lib/media/stripImageMetadata.ts");
    const meta = await import("/src/lib/media/imageMetadata.ts");
    const response = await fetch("/src/lib/media/__fixtures__/gps-photo.jpg");
    const inputBytes = new Uint8Array(await response.arrayBuffer());
    const input = new File([inputBytes], "IMG_0001.JPG", { type: "image/jpeg" });
    const output = await strip.stripImageMetadata(input);
    const outputBytes = new Uint8Array(await output.arrayBuffer());
    const bitmap = await createImageBitmap(output);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const top = Array.from(context.getImageData(Math.floor(bitmap.width / 2), 2, 1, 1).data.slice(0, 3));
    const bottom = Array.from(context.getImageData(Math.floor(bitmap.width / 2), bitmap.height - 3, 1, 1).data.slice(0, 3));
    return {
      before: meta.findImageMetadata(inputBytes),
      after: meta.findImageMetadata(outputBytes),
      type: output.type,
      name: output.name,
      width: bitmap.width,
      height: bitmap.height,
      top,
      bottom,
    };
  });
  expect(result.before).toEqual(expect.arrayContaining(["exif", "gps"]));
  expect(result.after.filter((kind) => kind !== "icc")).toEqual([]);
  expect(result.type).toBe("image/jpeg");
  expect(result.name).toBe("IMG_0001.jpg");
  // Stored 40×20 with orientation 6, so the upright photo is 20×40 with the red half on top.
  expect({ width: result.width, height: result.height }).toEqual({ width: 20, height: 40 });
  expect(result.top[0]).toBeGreaterThan(150);
  expect(result.top[2]).toBeLessThan(90);
  expect(result.bottom[2]).toBeGreaterThan(150);
  expect(result.bottom[0]).toBeLessThan(90);
});
