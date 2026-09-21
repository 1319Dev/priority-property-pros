/** iPhone widths that must show the full hero tagline without clipping. */
export const IPHONE_LAYOUT_WIDTHS = [320, 375, 390, 393, 414, 430] as const;

export const HERO_TAGLINE = "A marketplace, not a crew";

export const HERO_ART_VIEWBOX = "0 0 280 170";

/**
 * Compact homepage house photo — copy and CTAs stay above the fold.
 * Aspect-ratio and max-height live on the same overflow box so object-cover
 * does not clip the facade from the top.
 */
export const HERO_PHOTO_FRAME_CLASS =
  "relative aspect-[16/10] max-h-[10.5rem] w-full overflow-hidden rounded-[1.5rem] border border-forest-800/10 sm:max-h-[13rem] lg:aspect-[4/3] lg:max-h-[20rem]";

export const HERO_PHOTO_OBJECT_POSITION = "center 40%";

/**
 * Full-bleed homepage exterior. Fixed height plus overflow matches the other
 * marketing property photos so object-cover crops the facade instead of
 * letterboxing a graphic.
 */
export const HERO_BANNER_FRAME_CLASS =
  "relative h-56 w-full overflow-hidden bg-forest-800/10 sm:h-72 lg:h-80";

export const HERO_BANNER_SIZES = "100vw";

export function heroTaglineFitsWidth(widthPx: number): boolean {
  return IPHONE_LAYOUT_WIDTHS.includes(widthPx as (typeof IPHONE_LAYOUT_WIDTHS)[number]) || widthPx >= 320;
}

export function heroUsesHtmlTagline(): boolean {
  return true;
}

export function heroSvgContainsTagline(svgMarkup: string): boolean {
  return /a marketplace,\s*not a crew/i.test(svgMarkup);
}
