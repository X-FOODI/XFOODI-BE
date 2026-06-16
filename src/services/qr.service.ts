import QRCode from 'qrcode';

/**
 * Generate a QR code data URL for a reservation confirmation code.
 *
 * @param confirmationCode - The 6-character hex uppercase confirmation code (e.g. "A1B2C3")
 * @returns A base64 data URL string on success, or `null` if generation fails.
 *          Failure is logged but does NOT throw — reservation creation should never be blocked.
 */
export async function generateReservationQR(confirmationCode: string): Promise<string | null> {
  return generateQRUrl(confirmationCode, 256);
}

/**
 * Generic QR code data-URL generator.
 *
 * @param content - The string to encode in the QR code
 * @param width   - Pixel width of the generated image (default: 256)
 * @returns A base64 PNG data URL string on success, or `null` on failure.
 */
export async function generateQRUrl(content: string, width: number = 256): Promise<string | null> {
  try {
    const dataUrl = await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      width,
    });
    return dataUrl;
  } catch (error) {
    // Per requirement 9.9: log the error and return null — do not throw.
    console.error(`[QRService] Failed to generate QR for code ${content}: ${error}`);
    return null;
  }
}
