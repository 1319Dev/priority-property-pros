import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { findImageMetadata, hasIdentifyingMetadata } from "./imageMetadata";
import {
  HEIC_DECODE_MESSAGE,
  MAX_PHOTO_EDGE,
  PHOTO_CLEAN_MESSAGE,
  PhotoProcessingError,
  fitWithin,
  outputTypeFor,
  readBlobBytes,
  renameForType,
  stripImageMetadata,
  type StripDeps,
} from "./stripImageMetadata";

const here = path.dirname(fileURLToPath(import.meta.url));
const gpsJpeg = new Uint8Array(readFileSync(path.join(here, "__fixtures__/gps-photo.jpg")));
const cleanJpeg = new Uint8Array(readFileSync(path.join(here, "__fixtures__/clean-photo.jpg")));

function fakeDeps(output: Uint8Array<ArrayBuffer>, outputType = "image/jpeg", size = { width: 20, height: 40 }) {
  const close = vi.fn();
  const deps: StripDeps = {
    decode: vi.fn(async () => ({ ...size, source: {} as CanvasImageSource, close })),
    encode: vi.fn(async (_image, _w, _h, type) => new Blob([output], { type: type === outputType ? type : outputType })),
  };
  return { deps, close };
}

describe("photo metadata detection", () => {
  it("finds EXIF, GPS, and the comment in the GPS fixture", () => {
    const kinds = findImageMetadata(gpsJpeg);
    expect(kinds).toEqual(expect.arrayContaining(["exif", "gps", "comment"]));
    expect(hasIdentifyingMetadata(gpsJpeg)).toBe(true);
  });

  it("finds nothing identifying in a clean JPEG", () => {
    expect(findImageMetadata(cleanJpeg).filter((kind) => kind !== "icc")).toEqual([]);
    expect(hasIdentifyingMetadata(cleanJpeg)).toBe(false);
  });

  it("ignores formats it does not know", () => {
    expect(findImageMetadata(new TextEncoder().encode("%PDF-1.7"))).toEqual([]);
  });
});

describe("stripImageMetadata", () => {
  it("re-encodes a GPS-tagged JPEG and returns a file with no GPS", async () => {
    const { deps, close } = fakeDeps(cleanJpeg);
    const input = new File([gpsJpeg], "IMG_0001.JPG", { type: "image/jpeg" });
    const output = await stripImageMetadata(input, deps);
    const bytes = await readBlobBytes(output);
    expect(findImageMetadata(bytes)).not.toContain("gps");
    expect(hasIdentifyingMetadata(bytes)).toBe(false);
    expect(output.type).toBe("image/jpeg");
    expect(output.name).toBe("IMG_0001.jpg");
    expect(deps.decode).toHaveBeenCalledWith(input);
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 20, 40, "image/jpeg", 0.9);
    expect(close).toHaveBeenCalled();
  });

  it("fails closed if the re-encoded file still has metadata", async () => {
    const { deps } = fakeDeps(gpsJpeg);
    const input = new File([gpsJpeg], "a.jpg", { type: "image/jpeg" });
    await expect(stripImageMetadata(input, deps)).rejects.toThrow(PHOTO_CLEAN_MESSAGE);
  });

  it("converts HEIC to JPEG, and explains when the browser cannot read HEIC", async () => {
    const { deps } = fakeDeps(cleanJpeg);
    const heic = new File([new Uint8Array([0, 0, 0, 24])], "IMG_2.HEIC", { type: "image/heic" });
    const output = await stripImageMetadata(heic, deps);
    expect(output.type).toBe("image/jpeg");
    expect(output.name).toBe("IMG_2.jpg");

    const failing: StripDeps = { ...deps, decode: vi.fn(async () => Promise.reject(new Error("unsupported"))) };
    await expect(stripImageMetadata(heic, failing)).rejects.toThrow(HEIC_DECODE_MESSAGE);
    await expect(stripImageMetadata(heic, failing)).rejects.toBeInstanceOf(PhotoProcessingError);
  });

  it("falls back to PNG when the browser cannot encode WebP", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { deps } = fakeDeps(png, "image/png");
    const output = await stripImageMetadata(new File([png], "deck.webp", { type: "image/webp" }), deps);
    expect(deps.encode).toHaveBeenCalledTimes(2);
    expect(output.type).toBe("image/png");
    expect(output.name).toBe("deck.png");
  });

  it("caps the long edge and leaves PDFs untouched", async () => {
    const { deps } = fakeDeps(cleanJpeg, "image/jpeg", { width: 6000, height: 4000 });
    await stripImageMetadata(new File([gpsJpeg], "big.jpg", { type: "image/jpeg" }), deps);
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), MAX_PHOTO_EDGE, 2731, "image/jpeg", 0.9);

    const pdf = new File(["%PDF-1.7"], "license.pdf", { type: "application/pdf" });
    expect(await stripImageMetadata(pdf, deps)).toBe(pdf);
  });

  it("maps types, sizes, and names", () => {
    expect(outputTypeFor("image/png")).toBe("image/png");
    expect(outputTypeFor("image/heif")).toBe("image/jpeg");
    expect(fitWithin(4032, 3024)).toEqual({ width: 4032, height: 3024 });
    expect(fitWithin(3000, 9000)).toEqual({ width: 1365, height: 4096 });
    expect(renameForType("photo.jpeg", "image/jpeg")).toBe("photo.jpg");
    expect(renameForType("noext", "image/png")).toBe("noext.png");
  });
});
