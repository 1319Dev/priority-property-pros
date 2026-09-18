# Marketing image licenses

Every public photograph added for the visual-only marketing polish is listed here.
These assets are **original generated photographs** created for Priority Property Pros
on 2026-09-18. They are first-party marketing artwork owned by
PRIORITY PROPERTY PROS LLC for use on this website.

They are **not** taken from competitor sites. None include competitor logos,
watermarks, visible phone numbers, emails, websites, or fake PPP uniforms.

| Filename (derivatives) | Page(s) used | Source / credit | License | Commercial use | Modification allowed |
| --- | --- | --- | --- | --- | --- |
| `hero-contractor-{640,960,1280}w.{webp,jpg}` | Homepage hero band; How it works | Original generated photograph created for Priority Property Pros (contractor + property owner walkthrough at a residence). No third-party photographer. | Original first-party marketing asset. The company may use, display, and modify these images commercially on the PPP website. Repository copyright: [LICENSE](../LICENSE). | yes | yes |
| `service-fence-{480,768,1152}w.{webp,jpg}` | Homepage service visuals; Find a Pro demo fence portfolio | Original generated photograph created for Priority Property Pros (fencing contractor installing a cedar privacy fence). No third-party photographer. | Original first-party marketing asset. Same terms as above. | yes | yes |
| `service-landscaping-{480,768,1152}w.{webp,jpg}` | Homepage service visuals; Find a Pro demo lawn portfolio; browse yard illustration | Original generated photograph created for Priority Property Pros (lawn professional mowing a residential lawn). No third-party photographer. | Original first-party marketing asset. Same terms as above. | yes | yes |
| `service-handyman-{480,768,1152}w.{webp,jpg}` | Homepage service visuals; Find a Pro demo handyman portfolio; browse interior illustration | Original generated photograph created for Priority Property Pros (handyman repairing interior door trim). No third-party photographer. | Original first-party marketing asset. Same terms as above. | yes | yes |
| `service-plumbing-{480,768,1152}w.{webp,jpg}` | Homepage service visuals | Original generated photograph created for Priority Property Pros (residential plumber working under a kitchen sink). No third-party photographer. | Original first-party marketing asset. Same terms as above. | yes | yes |
| `service-electrical-{480,768,1152}w.{webp,jpg}` | Homepage service visuals; homepage For contractors panel; Become a Pro | Original generated photograph created for Priority Property Pros (electrician servicing a residential panel). No third-party photographer. | Original first-party marketing asset. Same terms as above. | yes | yes |
| `service-finished-exterior-{480,768,1152}w.{webp,jpg}` | Homepage hero sidebar (desktop); homepage browse preview; Find a Pro header; homepage service visuals | Original generated photograph created for Priority Property Pros (finished home with landscaping and privacy fence). No third-party photographer. | Original first-party marketing asset. Same terms as above. | yes | yes |

## Paths

All derivatives live in `public/images/marketing/`.

Rebuild with `node scripts/optimize-marketing-images.mjs` when the original
generated masters are available to the environment.

## What we did not use

- No Unsplash / Pexels / Pixabay files were shipped (candidate downloads were
  reviewed, then discarded because photographer credits could not be verified
  reliably in this environment).
- No images from Angi, Thumbtack, HomeAdvisor, or other competitor sites.
- No AI “PPP uniform” branding.

## Performance notes

- Format: WebP primary + JPEG fallback via `<picture>` / `srcset`.
- Hero WebP: ~37 KB (640w), ~63 KB (960w), ~92 KB (1280w).
- Service WebP cards: typically ~10–86 KB at 480–768w; largest finished-exterior
  1152w WebP is ~160 KB.
- Below-the-fold images use `loading="lazy"`. The homepage hero image is eager.
- Width / height attributes and aspect-ratio frames are set to limit CLS.
