// The longest side sent to a hosted model: enough to tell foods apart, small enough to upload quickly
const LONGEST_SIDE = 768;
// JPEG quality for the upload; the service accepts JPEG only
const JPEG_QUALITY = 0.8;

/**
 * Return the photo as a small JPEG data URL, ready to send.
 *
 * Re-drawing it on a canvas also drops the camera's location and other metadata,
 * so only the pixels leave the phone.
 */
export async function shrinkPhoto(photo: Blob): Promise<string> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));

  // Draw the photo at the smaller size
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
