# Marketing image licenses

Public images on this site are **first-party finished-house / curb-appeal
exteriors** plus one **owner-supplied branded marketing banner**. Generated
trade and worker scenes (handyman, plumbing, electrical, landscaping close-ups
of crews, fence workers, earlier hero-with-people composites) were removed
after review and were not reintroduced as photography.

The exterior photographs are **original generated photographs** created for
Priority Property Pros. They are first-party marketing artwork owned by
PRIORITY PROPERTY PROS LLC for use on this website. They are **not** taken
from a competitor site. They include no competitor logos, watermarks, visible
phone numbers, emails, or websites. No people appear in those frames.

The branded couple banner is **original first-party Priority Property Pros
marketing artwork provided by the owner on 2026-09-21**. It is official PPP
creative (logo, tagline, homeowner + branded pro, From Need to Done, steps,
and Find a Pro Today). It may be used, displayed, and modified commercially
on this website. The public homepage no longer uses it; the file stays in
`public/images/marketing/` for later use. More first-party photos are expected
later.

| Filename (derivatives) | Page(s) used | Source / credit | License | Commercial use | Modification allowed |
| --- | --- | --- | --- | --- | --- |
| `brand-hero-from-need-to-done-{480,640,768,960,1152}w.{webp,jpg}` | Retained asset (`brandHero`); not shown on the public homepage | Original first-party PPP marketing artwork provided by the owner on 2026-09-21 (logo + tagline “LOCAL PROS. REAL SOLUTIONS. HIGHER PRIORITY.”, homeowner messaging for a pro, branded contractor receiving a new job request, “From Need to Done.”, POST / CONNECT / GET IT DONE steps, FIND A PRO TODAY CTA, footer “HOMES • PEOPLE • STRONGER COMMUNITIES”). Not a third-party stock photo. | Original first-party marketing asset. The company may use, display, and modify this image commercially on the PPP website. Repository copyright: [LICENSE](../LICENSE). | yes | yes |
| `service-finished-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Homepage hero sidebar (`house`) | Original generated photograph created for Priority Property Pros on 2026-09-18 (finished suburban home with new landscaping, a clean driveway, and a cedar privacy fence). No third-party photographer. Kept as the secondary hero shot after later reviews. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-ranch-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Homepage hero banner (`ranch`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (cream-and-stone ranch with a brick walkway, fresh sod, and foundation plantings). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-two-story-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Homepage Find a Pro preview and Find a Pro header (`twoStory`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (two-story brick-and-siding home with a stone walkway and flowering shrubs). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-porch-exterior-{480,640,768,960,1152}w.{webp,jpg}` | How it works page (`porch`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (craftsman bungalow with a deep front porch, hanging baskets, and hydrangea beds). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-landscaped-yard-{480,640,768,960,1152}w.{webp,jpg}` | Homepage How it works band (`landscaped`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (professionally landscaped front yard with a paver walkway, ornamental grasses, and a Japanese maple). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |
| `service-dusk-exterior-{480,640,768,960,1152}w.{webp,jpg}` | Become a Pro header (`dusk`) | Original generated photograph created for Priority Property Pros on 2026-09-21 (navy two-story home at dusk with warm interior lights and a lit walkway). No third-party photographer. | Original first-party marketing asset. Same commercial terms as above. | yes | yes |

## Paths

All derivatives live in `public/images/marketing/`.

Rebuild with `node scripts/optimize-marketing-images.mjs` when the original
masters are available to the environment (the script also accepts checked-in
1152w JPEGs as fallback sources). Do not commit uncompressed PNG masters.

## What we did not use

- No Unsplash / Pexels / Pixabay files were shipped (candidate downloads were
  reviewed, then discarded because photographer credits could not be verified
  reliably in this environment).
- No images from Angi, Thumbtack, HomeAdvisor, or other competitor sites.
- No unofficial AI “PPP uniform” photography. The 2026-09-21 branded banner is
  owner-supplied first-party artwork and is the exception.
- Service cards use brand-color bars; Find a Pro demo portfolio tiles use
  abstract SVG illustrations already in the design system.

## Performance notes

- Format: WebP primary + JPEG fallback via `<picture>` / `srcset`.
- Width set: 480 / 640 / 768 / 960 / 1152. Typical house WebP sizes stay under
  ~40 KB (480w) through ~170 KB (1152w). The branded banner WebP is ~21 KB
  (480w) through ~70 KB (1152w).
- Below-the-fold images use `loading="lazy"`. The homepage hero banner,
  homepage house sidebar, Find a Pro header, How it works header, and Become a
  Pro header are eager.
- Width / height attributes and fixed-height frames are set to limit CLS. The
  homepage hero banner uses `object-cover` in that frame, the same treatment as
  the other exterior photos. The unused branded graphic is still registered as
  `object-contain` so its logo and CTA bar are not cropped if it is shown again.
- The homepage banner crop (`ranch`) is not reused. Homepage sidebar, How it
  works, and Become a Pro each keep their own photo. The Find a Pro teaser and
  Find a Pro header share `twoStory` because six exteriors cover seven surfaces.
