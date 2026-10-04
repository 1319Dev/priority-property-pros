import { writeSpaShells } from "../src/lib/pages/githubPagesFallback.ts";

const written = writeSpaShells("dist");
console.log(`Wrote ${written.length} GitHub Pages SPA shells (404.html plus one file per public route).`);
