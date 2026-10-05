import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";

/**
 * Rebuilds compressed WebP + JPEG derivatives for first-party marketing photos
 * and the branded homepage banner. Sources are documented in
 * docs/IMAGE_LICENSES.md. Masters are not committed; derivatives are.
 */
const WIDTHS = [480, 640, 768, 960, 1152];
const outDir = resolve("public/images/marketing");

const ASSETS = [
  {
    id: "brand-hero-from-need-to-done",
    masters: [
      "/opt/cursor/artifacts/assets/brand-hero-from-need-to-done.png",
      "/tmp/marketing-masters/brand-hero-from-need-to-done.png",
      resolve("public/images/marketing/brand-hero-from-need-to-done-1152w.jpg"),
    ],
  },
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

/**
 * Owner-supplied sheet crops. Coordinates are pixels on the 1619×971 composite.
 * The baked headline, button, trust bar, and caption labels are excluded.
 * The bearded contractor-with-van portrait is intentionally not exported.
 */
const SHEET_CANDIDATES = [
  "/home/ubuntu/.cursor/projects/workspace/uploads/ppp-official-image-sheet_5445.png",
  "/tmp/ppp-official-image-sheet.png",
  "/tmp/marketing-masters/ppp-official-image-sheet.png",
];

const OFFICIAL = [
  {
    id: "official-hero-homeowners",
    widths: [320, 480, 640, 650],
    crop: { left: 490, top: 0, width: 650, height: 312 },
    webpQuality: 82,
    jpegQuality: 84,
  },
  {
    id: "official-contractor-drill",
    widths: [240, 360, 467],
    crop: { left: 1151, top: 0, width: 467, height: 370 },
    webpQuality: 82,
    jpegQuality: 84,
  },
  {
    id: "official-category-kitchen",
    widths: [120, 188],
    crop: { left: 28, top: 484, width: 188, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-bathroom",
    widths: [120, 195],
    crop: { left: 225, top: 484, width: 195, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-decks",
    widths: [120, 196],
    crop: { left: 418, top: 484, width: 196, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-roofing",
    widths: [120, 194],
    crop: { left: 618, top: 484, width: 194, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-hvac",
    widths: [120, 191],
    crop: { left: 811, top: 484, width: 191, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-painting",
    widths: [120, 186],
    crop: { left: 1011, top: 484, width: 186, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-landscaping",
    widths: [120, 198],
    crop: { left: 1204, top: 484, width: 198, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-category-handyman",
    widths: [120, 194],
    crop: { left: 1398, top: 484, width: 194, height: 136 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-portfolio-deck",
    widths: [240, 360, 455],
    crop: { left: 371, top: 702, width: 455, height: 196 },
    webpQuality: 80,
    jpegQuality: 82,
  },
  {
    id: "official-trust-couple",
    widths: [240, 322],
    crop: { left: 834, top: 704, width: 322, height: 194 },
    webpQuality: 82,
    jpegQuality: 84,
  },
];

mkdirSync(outDir, { recursive: true });

const onlyOfficial = process.argv.includes("--official");
const sheetPath = SHEET_CANDIDATES.find((candidate) => existsSync(candidate));

async function writeSet(id, masterBuffer, widths, webpQuality, jpegQuality) {
  const meta = await sharp(masterBuffer).metadata();
  const sourceWidth = meta.width ?? Math.max(...widths);
  const targets = [...new Set(widths.map((width) => Math.min(width, sourceWidth)))].sort((a, b) => a - b);
  const written = [];
  for (const target of targets) {
    const resized = sharp(masterBuffer).resize({ width: target, withoutEnlargement: true });
    const webpOut = resolve(outDir, `${id}-${target}w.webp`);
    const jpegOut = resolve(outDir, `${id}-${target}w.jpg`);
    await resized.clone().webp({ quality: webpQuality, effort: 6 }).toFile(webpOut);
    await resized.clone().jpeg({ quality: jpegQuality, mozjpeg: true, chromaSubsampling: "4:2:0" }).toFile(jpegOut);
    const webpStat = await sharp(webpOut).metadata();
    written.push({ width: webpStat.width, height: webpStat.height, webp: statSync(webpOut).size, jpeg: statSync(jpegOut).size });
    console.log(
      `${basename(webpOut)} ${statSync(webpOut).size}B  ${basename(jpegOut)} ${statSync(jpegOut).size}B  ${webpStat.width}x${webpStat.height}`,
    );
  }
  return written;
}

if (!onlyOfficial) {
  for (const asset of ASSETS) {
    const src = asset.masters.find((candidate) => existsSync(candidate));
    if (!src) {
      throw new Error(`No source found for ${asset.id}. Checked: ${asset.masters.join(", ")}`);
    }

    const masterBuffer = await sharp(src).toBuffer();
    await writeSet(asset.id, masterBuffer, WIDTHS, 74, 78);
    console.log(`Wrote ${asset.id} derivatives to ${outDir} from ${src}`);
  }
}

if (!sheetPath && onlyOfficial) {
  const missing = OFFICIAL.filter((asset) => {
    const largest = Math.max(...asset.widths);
    return !existsSync(resolve(outDir, `${asset.id}-${largest}w.jpg`));
  });
  if (missing.length) {
    throw new Error(
      `Official sheet not found and some derivatives are missing (${missing.map((asset) => asset.id).join(", ")}).`,
    );
  }
}

for (const asset of OFFICIAL) {
  let masterBuffer;
  let from;
  if (sheetPath) {
    masterBuffer = await sharp(sheetPath).extract(asset.crop).toBuffer();
    from = `${sheetPath} crop ${asset.crop.left},${asset.crop.top} ${asset.crop.width}x${asset.crop.height}`;
  } else {
    const largest = Math.max(...asset.widths);
    const fallback = resolve(outDir, `${asset.id}-${largest}w.jpg`);
    if (!existsSync(fallback)) {
      throw new Error(`No source found for ${asset.id}. Sheet missing and ${fallback} is missing.`);
    }
    masterBuffer = await sharp(fallback).toBuffer();
    from = fallback;
  }
  await writeSet(asset.id, masterBuffer, asset.widths, asset.webpQuality, asset.jpegQuality);
  console.log(`Wrote ${asset.id} derivatives to ${outDir} from ${from}`);
}
