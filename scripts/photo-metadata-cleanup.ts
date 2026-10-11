/**
 * One-time audit and cleanup of photo metadata (GPS, camera, XMP, IPTC) in
 * files uploaded before uploads were stripped in the browser.
 *
 * NOT RUN AUTOMATICALLY. The owner runs it once, after this PR is deployed.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *     node --experimental-strip-types scripts/photo-metadata-cleanup.ts            # audit only (default)
 *
 *   npm i --no-save sharp
 *   ... node --experimental-strip-types scripts/photo-metadata-cleanup.ts --apply --backup-dir ./photo-backup
 *
 * Audit prints counts per bucket only: no file names, paths, user ids, or
 * coordinates. --apply rewrites each image that has identifying metadata in
 * place (same path, same content type) with sharp: `.rotate()` applies the
 * EXIF orientation to the pixels, and sharp drops all metadata on output. Only
 * project-photos and contractor-docs images are touched; PDFs are skipped.
 * --backup-dir keeps the originals locally so a bad rewrite can be restored;
 * delete that folder once the result is checked, because it still holds GPS.
 * Database rows are not changed: storage paths stay the same.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findImageMetadata } from "../src/lib/media/imageMetadata.ts";

const BUCKETS = ["project-photos", "contractor-docs"];
const IMAGE = /^image\/(jpeg|png|webp|heic|heif)$/i;

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");
const backupIndex = process.argv.indexOf("--backup-dir");
const backupDir = backupIndex > 0 ? process.argv[backupIndex + 1] : null;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
if (apply && !backupDir) {
  console.error("--apply needs --backup-dir <folder> so originals can be restored.");
  process.exit(2);
}

const headers = { Authorization: `Bearer ${key}`, apikey: key };

type StorageItem = { name: string; id: string | null; metadata?: { mimetype?: string } | null };

async function list(bucket: string, prefix = ""): Promise<Array<{ path: string; mime: string }>> {
  const out: Array<{ path: string; mime: string }> = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list ${bucket} failed: HTTP ${res.status}`);
    const items = (await res.json()) as StorageItem[];
    for (const item of items) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await list(bucket, full)));
      else out.push({ path: full, mime: item.metadata?.mimetype ?? "" });
    }
    if (items.length < 100) break;
  }
  return out;
}

async function download(bucket: string, objectPath: string): Promise<Uint8Array> {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, { headers });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function rewrite(bucket: string, objectPath: string, bytes: Uint8Array, mime: string): Promise<boolean> {
  const sharp = (await import("sharp" as string)).default as (input: Uint8Array) => {
    rotate(): { toFormat(f: string, o: object): { toBuffer(): Promise<Buffer> } };
  };
  const format = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpeg";
  if (/hei[cf]/i.test(mime)) return false; // keep HEIC as-is; re-upload would change the format behind a .heic path
  const cleaned = await sharp(bytes).rotate().toFormat(format, format === "jpeg" ? { quality: 90 } : {}).toBuffer();
  if (findImageMetadata(cleaned).some((kind) => kind !== "icc")) throw new Error("rewrite still has metadata");
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": mime, "x-upsert": "true" },
    body: cleaned,
  });
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
  return true;
}

let backupCount = 0;
for (const bucket of BUCKETS) {
  const files = (await list(bucket)).filter((file) => IMAGE.test(file.mime));
  const counts = { images: files.length, gps: 0, anyIdentifying: 0, rewritten: 0, skippedHeic: 0, errors: 0 };
  for (const file of files) {
    try {
      const bytes = await download(bucket, file.path);
      const kinds = findImageMetadata(bytes);
      if (kinds.includes("gps")) counts.gps += 1;
      if (!kinds.some((kind) => kind !== "icc")) continue;
      counts.anyIdentifying += 1;
      if (!apply) continue;
      if (backupDir) {
        mkdirSync(backupDir, { recursive: true });
        writeFileSync(path.join(backupDir, `${bucket}__${file.path.replaceAll("/", "__")}`), bytes);
        backupCount += 1;
      }
      if (await rewrite(bucket, file.path, bytes, file.mime)) counts.rewritten += 1;
      else counts.skippedHeic += 1;
    } catch {
      counts.errors += 1;
    }
  }
  console.log(`${bucket}: ${JSON.stringify(counts)}`);
}
if (apply) console.log(`Backed up ${backupCount} originals to ${backupDir}. Delete that folder after checking the photos.`);
