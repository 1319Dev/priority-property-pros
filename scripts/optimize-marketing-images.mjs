import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";

/**
 * Rebuilds compressed WebP + JPEG derivatives for first-party finished-exterior
 * marketing photos. Sources are original generated assets documented in
 * docs/IMAGE_LICENSES.md. Masters are not committed; derivatives are.
 */
const WIDTHS = [480, 640, 768, 960, 1152];
const outDir = resolve("public/images/marketing");

const ASSETS = [
  {
    id: "service-finished-exterior",
    masters: [
      "/opt/cursor/artifacts/assets/service-finished-exterior.png",
      "/tmp/marketing-masters/service-finished-exterior.png",
      resolve("public/images/marketing/service-finished-exterior-1152w.jpg"),
    ],
  },
  {
    id: "service-ranch-exterior",
    masters: [
      "/opt/cursor/artifacts/assets/marketing-ranch-exterior.png",
      "/tmp/marketing-masters/marketing-ranch-exterior.png",
      resolve("public/images/marketing/service-ranch-exterior-1152w.jpg"),
    ],
  },
  {
    id: "service-two-story-exterior",
    masters: [
      "/opt/cursor/artifacts/assets/marketing-two-story-exterior.png",
      "/tmp/marketing-masters/marketing-two-story-exterior.png",
      resolve("public/images/marketing/service-two-story-exterior-1152w.jpg"),
    ],
  },
  {
    id: "service-porch-exterior",
    masters: [
      "/opt/cursor/artifacts/assets/marketing-porch-exterior.png",
      "/tmp/marketing-masters/marketing-porch-exterior.png",
      resolve("public/images/marketing/service-porch-exterior-1152w.jpg"),
    ],
  },
  {
    id: "service-landscaped-yard",
    masters: [
      "/opt/cursor/artifacts/assets/marketing-landscaped-yard.png",
      "/tmp/marketing-masters/marketing-landscaped-yard.png",
      resolve("public/images/marketing/service-landscaped-yard-1152w.jpg"),
    ],
  },
  {
    id: "service-dusk-exterior",
    masters: [
      "/opt/cursor/artifacts/assets/marketing-dusk-exterior.png",
      "/tmp/marketing-masters/marketing-dusk-exterior.png",
      resolve("public/images/marketing/service-dusk-exterior-1152w.jpg"),
    ],
  },
];

mkdirSync(outDir, { recursive: true });

for (const asset of ASSETS) {
  const src = asset.masters.find((candidate) => existsSync(candidate));
  if (!src) {
    throw new Error(`No source found for ${asset.id}. Checked: ${asset.masters.join(", ")}`);
  }

  const master = sharp(src);
  const meta = await master.metadata();
  const sourceWidth = meta.width ?? Math.max(...WIDTHS);
  const masterBuffer = await master.toBuffer();
  for (const width of WIDTHS) {
    const target = Math.min(width, sourceWidth);
    const resized = sharp(masterBuffer).resize({ width: target, withoutEnlargement: true });
    const webpOut = resolve(outDir, `${asset.id}-${target}w.webp`);
    const jpegOut = resolve(outDir, `${asset.id}-${target}w.jpg`);
    await resized.clone().webp({ quality: 74, effort: 6 }).toFile(webpOut);
    await resized.clone().jpeg({ quality: 78, mozjpeg: true, chromaSubsampling: "4:2:0" }).toFile(jpegOut);
    const webpStat = await sharp(webpOut).metadata();
    console.log(
      `${basename(webpOut)} ${statSync(webpOut).size}B  ${basename(jpegOut)} ${statSync(jpegOut).size}B  ${webpStat.width}x${webpStat.height}`,
    );
  }
  console.log(`Wrote ${asset.id} derivatives to ${outDir} from ${src}`);
}
