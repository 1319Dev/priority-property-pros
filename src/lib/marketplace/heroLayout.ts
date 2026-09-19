/** iPhone widths that must show the full hero tagline without clipping. */
export const IPHONE_LAYOUT_WIDTHS = [320, 375, 390, 393, 414, 430] as const;

export const HERO_TAGLINE = "A marketplace, not a crew";

export const HERO_ART_VIEWBOX = "0 0 280 170";

/**
 * Homepage house photo crop window.
 * Aspect-ratio and max-height must live on the same box so object-cover /
 * object-position apply to the visible frame (a max-height parent wrapping a
 * taller 16:9 child clips from the top and cuts the house in half on desktop).
 * Mobile heights stay compact; md+ opens the frame around the facade and yard.
 */
export const HERO_PHOTO_FRAME_CLASS =
  "relative aspect-[16/9] max-h-[13.75rem] w-full overflow-hidden sm:max-h-[17.5rem] md:aspect-[2/1] md:max-h-[24rem] lg:max-h-[28rem] xl:max-h-[32rem] 2xl:max-h-[36rem]";

export const HERO_PHOTO_OBJECT_POSITION = "center 40%";

export function heroTaglineFitsWidth(widthPx: number): boolean {
  return IPHONE_LAYOUT_WIDTHS.includes(widthPx as (typeof IPHONE_LAYOUT_WIDTHS)[number]) || widthPx >= 320;
}

export function heroUsesHtmlTagline(): boolean {
  return true;
}

export function heroSvgContainsTagline(svgMarkup: string): boolean {
  return /a marketplace,\s*not a crew/i.test(svgMarkup);
}
