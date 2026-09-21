# Marketing image licenses

Public photographs on this site are **first-party finished-house / curb-appeal
exteriors**. All generated trade and worker scenes (handyman, plumbing,
electrical, landscaping close-ups of crews, fence workers, hero-with-people)
were removed after review and were not reintroduced.

Each asset is an **original generated photograph** created for Priority
Property Pros. They are first-party marketing artwork owned by PRIORITY
PROPERTY PROS LLC for use on this website.

They are **not** taken from a competitor site. They include no competitor
logos, watermarks, visible phone numbers, emails, websites, or fake PPP
uniforms. No people appear in the frames.

| Filename (derivatives) | Page(s) used | Source / credit | License | Commercial use | Modification allowed |
| --- | --- | --- | --- | --- | --- |
| `service-finished-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Homepage hero only (`house`) | Original generated photograph created for Priority Property Pros on 2026-09-18 (finished suburban home with new landscaping, a clean driveway, and a cedar privacy fence). No third-party photographer. Kept as the hero shot after later reviews. | Original first-party marketing asset. The company may use, display, and modify this image commercially on the PPP website. Repository copyright: [LICENSE](../LICENSE). | yes | yes |
| `service-ranch-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Homepage Find a Pro preview (`ranch`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (cream-and-stone ranch with a brick walkway, fresh sod, and foundation plantings). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-two-story-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Find a Pro header (`twoStory`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (two-story brick-and-siding home with a stone walkway and flowering shrubs). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-porch-exterior-{480,640,768,960,1152}w.{webp,jpg}` | How it works page (`porch`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (craftsman bungalow with a deep front porch, hanging baskets, and hydrangea beds). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-landscaped-yard-{480,640,768,960,1152}w.{webp,jpg}` | Homepage How it works band (`landscaped`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (professionally landscaped front yard with a paver walkway, ornamental grasses, and a Japanese maple). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-dusk-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Become a Pro header (`dusk`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (navy two-story home at dusk with warm interior lights and a lit walkway). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |

## Paths

All derivatives live in `public/images/marketing/`.

Rebuild with `node scripts/optimize-marketing-images.mjs` when the original
generated masters are available to the environment (the script also accepts
checked-in 1152w JPEGs as fallback sources). Do not commit uncompressed PNG
masters.

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
- Width set: 480 / 640 / 768 / 960 / 1152. Typical house WebP sizes stay under
  ~40 KB (480w) through ~170 KB (1152w).
- Below-the-fold images use `loading="lazy"`. The homepage hero, Find a Pro
  header, How it works header, and Become a Pro header are eager.
- Width / height attributes and aspect-ratio frames are set to limit CLS.
- Major marketing surfaces each use a **different** photo id so the same house
  is not repeated across homepage hero, Find a Pro, How it works, and Become a
  Pro.
