/** Homeowners upload photos without captions, so the alt text names the photo by position. */
export function projectPhotoAlt(index: number, total: number): string {
  return total > 1 ? `Project photo ${index + 1} of ${total}` : "Project photo";
}
