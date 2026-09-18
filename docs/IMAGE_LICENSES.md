# Marketing image licenses

Public photographs on this site are limited to **one finished-house / exterior
property photo**. All generated trade and worker scenes (handyman, plumbing,
electrical, landscaping, fence, hero-with-people) were removed after review.

The remaining asset is an **original generated photograph** created for
Priority Property Pros on 2026-09-18. It is first-party marketing artwork
owned by PRIORITY PROPERTY PROS LLC for use on this website.

It is **not** taken from a competitor site. It includes no competitor logos,
watermarks, visible phone numbers, emails, websites, or fake PPP uniforms.

| Filename (derivatives) | Page(s) used | Source / credit | License | Commercial use | Modification allowed |
| --- | --- | --- | --- | --- | --- |
| `service-finished-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Homepage hero band and desktop sidebar; homepage Find a Pro preview; Find a Pro header; How it works; Become a Pro | Original generated photograph created for Priority Property Pros (finished suburban home with new landscaping, a clean driveway, and a cedar privacy fence). No third-party photographer. Kept after 2026-09-18 review — the only marketing photograph still shipped. | Original first-party marketing asset. The company may use, display, and modify this image commercially on the PPP website. Repository copyright: [LICENSE](../LICENSE). | yes | yes |

## Paths

All derivatives live in `public/images/marketing/`.

Rebuild with `node scripts/optimize-marketing-images.mjs` when the original
generated master is available to the environment (the script also accepts the
checked-in 1152w JPEG as a fallback source).

## What we did not use

- No Unsplash / Pexels / Pixabay files were shipped (candidate downloads were
  reviewed, then discarded because photographer credits could not be verified
  reliably in this environment).
- No images from Angi, Thumbtack, HomeAdvisor, or other competitor sites.
- No AI “PPP uniform” branding.
- No trade / worker photographs. Service cards use brand-color bars; Find a
  Pro demo portfolio tiles use abstract SVG illustrations already in the
  design system.

## Performance notes

- Format: WebP primary + JPEG fallback via `<picture>` / `srcset`.
- House WebP: ~38 KB (480w), ~61 KB (640w), ~85 KB (768w), ~115 KB (960w),
  ~160 KB (1152w).
- Below-the-fold images use `loading="lazy"`. The homepage hero image is eager.
- Width / height attributes and aspect-ratio frames are set to limit CLS.
