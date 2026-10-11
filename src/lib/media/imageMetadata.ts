/**
 * Byte-level photo metadata detection. No DOM, so it runs in the browser, in
 * Node scripts, and in tests. Used as a guard after re-encoding and by the
 * one-time storage audit script.
 */

export type ImageMetadataKind = "exif" | "gps" | "xmp" | "iptc" | "comment" | "icc";

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + length)));

function readU16(bytes: Uint8Array, offset: number, little: boolean): number {
  return little ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number {
  return little
    ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
    : ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

/** True when a TIFF/EXIF block (starting at its byte-order mark) has a GPS IFD pointer. */
export function tiffHasGps(tiff: Uint8Array): boolean {
  if (tiff.length < 8) return false;
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return false;
  const little = order === "II";
  const ifd0 = readU32(tiff, 4, little);
  if (ifd0 + 2 > tiff.length) return false;
  const count = readU16(tiff, ifd0, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (readU16(tiff, entry, little) === 0x8825) return true;
  }
  return false;
}

function jpegMetadata(bytes: Uint8Array, found: Set<ImageMetadataKind>) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // image data starts; metadata segments come before it
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const start = offset + 4;
    if (marker === 0xe1) {
      if (ascii(bytes, start, 6) === "Exif\0\0") {
        found.add("exif");
        if (tiffHasGps(bytes.subarray(start + 6, offset + 2 + length))) found.add("gps");
      } else if (ascii(bytes, start, 28).startsWith("http://ns.adobe.com/xap/1.0/")) {
        found.add("xmp");
      }
    } else if (marker === 0xed) {
      found.add("iptc");
    } else if (marker === 0xe2 && ascii(bytes, start, 11) === "ICC_PROFILE") {
      found.add("icc");
    } else if (marker === 0xfe) {
      found.add("comment");
    }
    offset += 2 + length;
  }
}

function pngMetadata(bytes: Uint8Array, found: Set<ImageMetadataKind>) {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "eXIf") {
      found.add("exif");
      if (tiffHasGps(data)) found.add("gps");
    } else if (type === "iTXt" && ascii(data, 0, 17) === "XML:com.adobe.xmp") {
      found.add("xmp");
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      found.add("comment");
    } else if (type === "iCCP") {
      found.add("icc");
    }
    if (type === "IEND") break;
    offset += 12 + length;
  }
}

function webpMetadata(bytes: Uint8Array, found: Set<ImageMetadataKind>) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = readU32(bytes, offset + 4, true);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "EXIF") {
      found.add("exif");
      const tiff = ascii(data, 0, 6) === "Exif\0\0" ? data.subarray(6) : data;
      if (tiffHasGps(tiff)) found.add("gps");
    } else if (type === "XMP ") {
      found.add("xmp");
    } else if (type === "ICCP") {
      found.add("icc");
    }
    offset += 8 + length + (length % 2);
  }
}

/** Metadata blocks present in a JPEG, PNG, or WebP file. Unknown formats return []. */
export function findImageMetadata(input: Uint8Array | ArrayBuffer): ImageMetadataKind[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const found = new Set<ImageMetadataKind>();
  if (bytes[0] === 0xff && bytes[1] === 0xd8) jpegMetadata(bytes, found);
  else if (ascii(bytes, 1, 3) === "PNG") pngMetadata(bytes, found);
  else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") webpMetadata(bytes, found);
  return [...found];
}

/** Metadata that can identify a person, place, or device. ICC color profiles are not identifying. */
export function hasIdentifyingMetadata(input: Uint8Array | ArrayBuffer): boolean {
  return findImageMetadata(input).some((kind) => kind !== "icc");
}
