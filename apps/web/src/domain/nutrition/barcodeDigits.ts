// The barcode lengths used on packaged food: EAN-8, UPC-A, EAN-13 and GTIN-14
const BARCODE_DIGITS = /^\d{8,14}$/;

/** Return whether a text is a packaged-food barcode once its spaces are removed. */
export function isBarcode(text: string): boolean {
  return BARCODE_DIGITS.test(text.replace(/\s/g, ''));
}

/** Return the digits of a barcode, or throw what to fix. */
export function readBarcodeDigits(text: string): string {
  // Ignore anything that is not 8 to 14 digits, because no product has such a code
  if (!isBarcode(text)) {
    throw new Error('Enter the 8 to 14 digits printed under the barcode.');
  }
  return text.replace(/\s/g, '');
}
