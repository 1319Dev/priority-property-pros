import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

function markSvg(size, padded) {
  const inset = padded ? size * 0.18 : 0;
  const inner = size - inset * 2;
  const radius = padded ? 0 : Math.round(size * 0.18);
  const strokeGold = Math.max(inner * 0.055, 4);
  const strokeCream = Math.max(inner * 0.048, 3.5);
  const strokePillar = Math.max(inner * 0.05, 3.5);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#1A3C2E"/>
  <g transform="translate(${inset} ${inset})">
    <path d="M ${inner * 0.12} ${inner * 0.48} L ${inner * 0.5} ${inner * 0.16} L ${inner * 0.88} ${inner * 0.48}" fill="none" stroke="#C9A227" stroke-width="${strokeGold}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M ${inner * 0.22} ${inner * 0.46} V ${inner * 0.84} H ${inner * 0.78} V ${inner * 0.46}" fill="none" stroke="#FBF8F1" stroke-width="${strokeCream}" stroke-linejoin="round"/>
    <path d="M ${inner * 0.36} ${inner * 0.84} V ${inner * 0.56} M ${inner * 0.5} ${inner * 0.84} V ${inner * 0.52} M ${inner * 0.64} ${inner * 0.84} V ${inner * 0.56}" fill="none" stroke="#E0C078" stroke-width="${strokePillar}" stroke-linecap="round"/>
  </g>
</svg>`;
}

const outDir = resolve("public/icons");
mkdirSync(outDir, { recursive: true });

const jobs = [
  { file: resolve("public/icons/icon-192.png"), svg: markSvg(192, false) },
  { file: resolve("public/icons/icon-512.png"), svg: markSvg(512, false) },
  { file: resolve("public/icons/icon-512-maskable.png"), svg: markSvg(512, true) },
  { file: resolve("public/apple-touch-icon.png"), svg: markSvg(180, false) },
];

for (const job of jobs) {
  await sharp(Buffer.from(job.svg)).png({ compressionLevel: 9 }).toFile(job.file);
}

console.log("Wrote PWA PNG icons and apple-touch-icon.png");
