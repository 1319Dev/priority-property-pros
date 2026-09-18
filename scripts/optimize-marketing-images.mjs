import { mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";

/**
 * Rebuilds compressed WebP + JPEG derivatives for the public marketing photos.
 * Sources are original generated assets documented in docs/IMAGE_LICENSES.md.
 */
const jobs = [
  {
    id: "hero-contractor",
    src: "/opt/cursor/artifacts/assets/hero-contractor-property-owner.png",
    widths: [640, 960, 1280],
  },
  {
    id: "service-fence",
    src: "/opt/cursor/artifacts/assets/service-privacy-fence.png",
    widths: [480, 768, 1152],
  },
  {
    id: "service-landscaping",
    src: "/cursor/stores/bc-6944f6bd-63e5-580a-b327-0bad43f862e5/artifacts/assets/service-landscaping.png",
    widths: [480, 768, 1152],
  },
  {
    id: "service-handyman",
    src: "/opt/cursor/artifacts/assets/service-handyman-interior.png",
    widths: [480, 768, 1152],
  },
  {
    id: "service-plumbing",
    src: "/cursor/stores/bc-6944f6bd-63e5-580a-b327-0bad43f862e5/artifacts/assets/service-plumbing.png",
    widths: [480, 768, 1152],
  },
  {
    id: "service-electrical",
    src: "/opt/cursor/artifacts/assets/service-electrical-hvac.png",
    widths: [480, 768, 1152],
  },
  {
    id: "service-finished-exterior",
    src: "/opt/cursor/artifacts/assets/service-finished-exterior.png",
    widths: [480, 768, 1152],
  },
];

const outDir = resolve("public/images/marketing");
mkdirSync(outDir, { recursive: true });

for (const job of jobs) {
  const meta = await sharp(job.src).metadata();
  const sourceWidth = meta.width ?? Math.max(...job.widths);
  for (const width of job.widths) {
    const target = Math.min(width, sourceWidth);
    const resized = sharp(job.src).resize({ width: target, withoutEnlargement: true });
    const webpOut = resolve(outDir, `${job.id}-${target}w.webp`);
    const jpegOut = resolve(outDir, `${job.id}-${target}w.jpg`);
    await resized
      .clone()
      .webp({ quality: 74, effort: 6 })
      .toFile(webpOut);
    await resized
      .clone()
      .jpeg({ quality: 78, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toFile(jpegOut);
    const webpStat = await sharp(webpOut).metadata();
    const jpegStat = await sharp(jpegOut).metadata();
    console.log(
      `${basename(webpOut)} ${webpStat.size}B  ${basename(jpegOut)} ${jpegStat.size}B  ${webpStat.width}x${webpStat.height}`,
    );
  }
}

console.log(`Wrote marketing derivatives to ${outDir}`);
