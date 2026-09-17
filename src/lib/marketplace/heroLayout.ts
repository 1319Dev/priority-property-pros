/** iPhone widths that must show the full hero tagline without clipping. */
export const IPHONE_LAYOUT_WIDTHS = [320, 375, 390, 393, 414, 430] as const;

export const HERO_TAGLINE = "A marketplace, not a crew";

export const HERO_ART_VIEWBOX = "0 0 280 170";

export function heroTaglineFitsWidth(widthPx: number): boolean {
  return IPHONE_LAYOUT_WIDTHS.includes(widthPx as (typeof IPHONE_LAYOUT_WIDTHS)[number]) || widthPx >= 320;
}

export function heroUsesHtmlTagline(): boolean {
  return true;
}

export function heroSvgContainsTagline(svgMarkup: string): boolean {
  return /a marketplace,\s*not a crew/i.test(svgMarkup);
}
