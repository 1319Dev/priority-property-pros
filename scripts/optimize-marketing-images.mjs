import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";

/**
 * Rebuilds compressed WebP + JPEG derivatives for the single house / finished-exterior
 * marketing photo. Sources are original generated assets documented in docs/IMAGE_LICENSES.md.
 */
const HOUSE_ID = "service-finished-exterior";
const HOUSE_WIDTHS = [480, 640, 768, 960, 1152];
const MASTER_CANDIDATES = [
  "/opt/cursor/artifacts/assets/service-finished-exterior.png",
  "/tmp/marketing-masters/service-finished-exterior.png",
  resolve("public/images/marketing/service-finished-exterior-1152w.jpg"),
];

const src = MASTER_CANDIDATES.find((candidate) => existsSync(candidate));
if (!src) {
  throw new Error("No house / finished-exterior source found for marketing derivatives.");
}

const outDir = resolve("public/images/marketing");
mkdirSync(outDir, { recursive: true });

const meta = await sharp(src).metadata();
const sourceWidth = meta.width ?? Math.max(...HOUSE_WIDTHS);
for (const width of HOUSE_WIDTHS) {
  const target = Math.min(width, sourceWidth);
  const resized = sharp(src).resize({ width: target, withoutEnlargement: true });
  const webpOut = resolve(outDir, `${HOUSE_ID}-${target}w.webp`);
  const jpegOut = resolve(outDir, `${HOUSE_ID}-${target}w.jpg`);
  await resized.clone().webp({ quality: 74, effort: 6 }).toFile(webpOut);
  await resized.clone().jpeg({ quality: 78, mozjpeg: true, chromaSubsampling: "4:2:0" }).toFile(jpegOut);
  const webpStat = await sharp(webpOut).metadata();
  const jpegStat = await sharp(jpegOut).metadata();
  console.log(
    `${basename(webpOut)} ${webpStat.size}B  ${basename(jpegOut)} ${jpegStat.size}B  ${webpStat.width}x${webpStat.height}`,
  );
}

console.log(`Wrote house marketing derivatives to ${outDir} from ${src}`);
