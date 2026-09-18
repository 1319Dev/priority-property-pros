/**
 * Photo safety for pre-connection surfaces.
 *
 * Image OCR is NOT implemented. PPP does not scan pixels for phone numbers,
 * emails, or street addresses inside photos. Treat photo OCR as a residual
 * risk and rely on upload guidance, filename sanitization, and report hooks.
 */

export const PHOTO_OCR_NOT_IMPLEMENTED = true;

export const PHOTO_UPLOAD_GUIDANCE =
  "Upload photos of the work area only. Do not include mailboxes, house numbers, faces, license plates, phones, emails, websites, QR codes, or paperwork with private contact. File names are sanitized. PPP does not run image text recognition.";

export const PHOTO_OCR_RISK_NOTE =
  "Photos can still contain visible contact or an exact address. PPP does not currently verify images with OCR. Use Report if a photo looks unsafe.";

export const PHOTO_REPORT_LABEL = "Report photo";

export function photoOcrVerificationExists(): boolean {
  return false;
}
