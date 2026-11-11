import { isBarcode } from '../domain/nutrition/barcodeDigits';
import { confirmBarcode } from './confirmBarcode';

// The packaged-food barcode formats, which is all a nutrition lookup can use
const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** The part of the browser's barcode reader this file uses; it exists on Android Chrome. */
interface BrowserReader {
  detect: (image: ImageBitmap) => Promise<{ rawValue: string; boundingBox?: DOMRectReadOnly }[]>;
}

/** What one photo gave: digits both readers agree on, or readings the person must check. */
export type BarcodeScanResult = { kind: 'agreed'; digits: string } | { kind: 'choices'; digits: string[] };

/**
 * Return what the browser's own reader sees, or nothing where it is missing or fails.
 *
 * The bundled reader still runs afterwards, so a phone without this reader can scan too.
 */
async function browserReadings(bitmap: ImageBitmap) {
  const Reader = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BrowserReader }).BarcodeDetector;
  if (Reader === undefined) return [];
  try {
    return await new Reader({ formats: FOOD_FORMATS }).detect(bitmap);
  } catch {
    // Ignore a reader that throws, because the bundled reader can still try
    return [];
  }
}

/**
 * Read the barcode in a photo with two readers, on this device.
 *
 * Two readers are used because each was seen misreading a clear photo on 11 Nov, and a
 * wrong number can still pass the barcode's own checksum. Agreement fills the digits;
 * anything less is shown to the person to check against the packet. The photo is never sent.
 */
export async function scanBarcode(photo: Blob): Promise<BarcodeScanResult> {
  const bitmap = await createImageBitmap(photo);
  try {
    // Read with the browser first, because its box tells the bundled reader where to look
    const found = await browserReadings(bitmap);
    const browser = [...new Set(found.map((item) => item.rawValue.replace(/\s/g, '')).filter(isBarcode))];
    if (browser.length > 1) throw new Error('More than one barcode was found. Frame one code, or type its number.');
    const bundled = await confirmBarcode(bitmap, found[0]?.boundingBox);
    const readings = [...new Set([bundled, ...browser].filter((value): value is string => value !== null && isBarcode(value)))];

    // Ignore a photo neither reader could read, because there is nothing to offer
    if (readings.length === 0) {
      throw new Error('Could not read the barcode. Try another photo, or type the number printed below the bars.');
    }

    // Compare with leading zeros added, because one reader writes a UPC with 12 digits and the other with 13
    const agreed = browser[0] !== undefined && bundled !== null && browser[0].padStart(14, '0') === bundled.padStart(14, '0');
    return agreed ? { kind: 'agreed', digits: browser[0]! } : { kind: 'choices', digits: readings };
  } finally {
    // Release the photo once its digits have been read
    bitmap.close();
  }
}
