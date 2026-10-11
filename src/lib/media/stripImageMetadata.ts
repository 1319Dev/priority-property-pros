import { hasIdentifyingMetadata } from "./imageMetadata";

/**
 * Re-encodes a photo in the browser before it is uploaded, so location (GPS),
 * camera, time, and other EXIF/XMP/IPTC metadata never reach storage.
 *
 * - The camera's EXIF orientation is applied to the pixels first, so the photo
 *   stays upright after the orientation tag is gone.
 * - JPEG and HEIC/HEIF become JPEG (quality 0.9). PNG stays PNG. WebP stays
 *   WebP where the browser can encode it, otherwise PNG.
 * - The long edge is capped at 4096 px.
 * - Fails closed: if the photo cannot be decoded or the output still carries
 *   metadata, the upload is refused instead of sending the original file.
 * - Non-image files (PDF credentials) are returned unchanged.
 */

export const MAX_PHOTO_EDGE = 4096;
export const JPEG_QUALITY = 0.9;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export class PhotoProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoProcessingError";
  }
}

export const HEIC_DECODE_MESSAGE =
  "This browser can't read HEIC photos. Upload a JPEG instead, or on iPhone set Camera › Formats to Most Compatible.";
export const PHOTO_DECODE_MESSAGE = "We couldn't read this photo. Try a different JPEG, PNG, or WebP file.";
export const PHOTO_CLEAN_MESSAGE = "We couldn't remove location data from this photo, so it was not uploaded.";

export type DecodedImage = { width: number; height: number; source: CanvasImageSource; close?: () => void };

export type StripDeps = {
  decode: (file: Blob) => Promise<DecodedImage>;
  encode: (image: DecodedImage, width: number, height: number, type: string, quality: number) => Promise<Blob>;
};

export function isStrippableImage(type: string): boolean {
  return IMAGE_TYPES.has(type.toLowerCase());
}

export function outputTypeFor(inputType: string): string {
  const type = inputType.toLowerCase();
  if (type === "image/png") return "image/png";
  if (type === "image/webp") return "image/webp";
  return "image/jpeg";
}

export function fitWithin(width: number, height: number, maxEdge = MAX_PHOTO_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function renameForType(name: string, type: string): string {
  const ext = EXTENSIONS[type] ?? "jpg";
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "photo";
  return `${base}.${ext}`;
}

async function decodeWithImageElement(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  // <img> applies EXIF orientation by default (CSS image-orientation: from-image).
  return { width: img.naturalWidth, height: img.naturalHeight, source: img, close: () => URL.revokeObjectURL(url) };
}

export const browserStripDeps: StripDeps = {
  async decode(file) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
      } catch {
        // Fall through to <img>, which can decode some formats createImageBitmap rejects.
      }
    }
    return decodeWithImageElement(file);
  },
  async encode(image, width, height, type, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoProcessingError(PHOTO_DECODE_MESSAGE);
    if (type === "image/jpeg") {
      // JPEG has no transparency; paint white instead of black behind transparent pixels.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(image.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new PhotoProcessingError(PHOTO_DECODE_MESSAGE);
    return blob;
  },
};

/** Reads a Blob's bytes (FileReader fallback for older engines and jsdom). */
export async function readBlobBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(blob);
  });
}

/** Returns a metadata-free copy of an image file. Non-images are returned unchanged. */
export async function stripImageMetadata(file: File, deps: StripDeps = browserStripDeps): Promise<File> {
  if (!isStrippableImage(file.type)) return file;
  const heic = /^image\/hei[cf]$/i.test(file.type);
  let image: DecodedImage;
  try {
    image = await deps.decode(file);
  } catch {
    throw new PhotoProcessingError(heic ? HEIC_DECODE_MESSAGE : PHOTO_DECODE_MESSAGE);
  }
  try {
    if (!image.width || !image.height) throw new PhotoProcessingError(PHOTO_DECODE_MESSAGE);
    const size = fitWithin(image.width, image.height);
    const requested = outputTypeFor(file.type);
    let blob = await deps.encode(image, size.width, size.height, requested, JPEG_QUALITY);
    if (requested === "image/webp" && blob.type !== "image/webp") {
      // Some browsers cannot encode WebP and silently return PNG.
      blob = await deps.encode(image, size.width, size.height, "image/png", JPEG_QUALITY);
    }
    const type = blob.type || requested;
    const bytes = await readBlobBytes(blob);
    if (hasIdentifyingMetadata(bytes)) throw new PhotoProcessingError(PHOTO_CLEAN_MESSAGE);
    return new File([bytes], renameForType(file.name, type), { type, lastModified: Date.now() });
  } finally {
    image.close?.();
  }
}
