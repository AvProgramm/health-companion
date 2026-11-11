import type { DecodeHintType as Hint } from '@zxing/library';

// Limit the verification canvas while keeping the barcode bars sharp.
const LONGEST_SIDE = 1800;
// Keep the blank space beside the bars, which the reader uses to find their ends.
const EDGE_PADDING = 0.15;

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Return a crop around the detected barcode, clipped to the original image. */
function barcodeRegion(bitmap: ImageBitmap, bounds: DOMRectReadOnly, padHeight = true): Region {
  const padding = Math.max(bounds.width, bounds.height) * EDGE_PADDING;
  const x = Math.max(0, bounds.x - padding);
  const verticalPadding = padHeight ? padding : 0;
  const y = Math.max(0, bounds.y - verticalPadding);
  const right = Math.min(bitmap.width, bounds.right + padding);
  const bottom = Math.min(bitmap.height, bounds.bottom + verticalPadding);
  return { x, y, width: right - x, height: bottom - y };
}

/** Return a second on-device reading of the bars, or null if they cannot be confirmed. */
export async function confirmBarcode(bitmap: ImageBitmap, bounds?: DOMRectReadOnly): Promise<string | null> {
  // Load the reader only when someone chooses a barcode photo.
  const { BarcodeFormat, BinaryBitmap, DecodeHintType, GlobalHistogramBinarizer,
    HTMLCanvasElementLuminanceSource, MultiFormatOneDReader, NotFoundException,
  } = await import('@zxing/library');
  const hints = new Map<Hint, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new MultiFormatOneDReader(hints);
  const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  // Keep horizontal quiet space in both crops. Try the bar height without nearby text first.
  const regions = bounds === undefined ? [full] : [
    barcodeRegion(bitmap, bounds, false), barcodeRegion(bitmap, bounds), full,
  ];

  // Try a wider crop and the whole frame if the first crop cannot be read.
  for (const region of regions) {
    if (!(region.width > 0 && region.height > 0)) continue;
    const scale = Math.min(1, LONGEST_SIDE / Math.max(region.width, region.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(region.width * scale));
    canvas.height = Math.max(1, Math.round(region.height * scale));
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);

    // Ignore a failed read because it cannot confirm any digits.
    try {
      const pixels = new HTMLCanvasElementLuminanceSource(canvas);
      const image = new BinaryBitmap(new GlobalHistogramBinarizer(pixels));
      return reader.decode(image, hints).getText();
    } catch (problem) {
      if (!(problem instanceof NotFoundException)) throw problem;
    }
  }
  return null;
}
