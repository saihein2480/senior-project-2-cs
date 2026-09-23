/**
 * Client-side image downscaling for images stored as base64 in Firestore.
 *
 * Why this exists: cancellation/refund requests embed the customer's payment QR
 * and item photos directly on the transaction document. Firestore caps a single
 * field value at ~1,048,487 bytes and a whole document at 1 MiB, and base64
 * inflates a file by roughly 33%. A raw phone photo therefore fails with the
 * opaque error:
 *
 *   3 INVALID_ARGUMENT: Property cancellationRequest contains an invalid nested entity.
 *
 * Downscaling before encoding keeps every upload comfortably inside those caps.
 *
 * Longer term these belong in R2 with only a URL on the document; see
 * documents/CLOUDFLARE_R2_SETUP.md.
 */

/**
 * Budget for a single payment-QR image. QR codes and bank screenshots survive
 * aggressive JPEG compression well, so this stays readable.
 */
export const MAX_QR_DATA_URL_BYTES = 150 * 1024;

/**
 * Budget per item photo. Up to 5 are allowed on the same document as a QR
 * image, so this is deliberately tighter.
 */
export const MAX_PHOTO_DATA_URL_BYTES = 80 * 1024;

/**
 * Worst realistic case these budgets produce:
 *
 *   return request      150 KB QR + 5 x 80 KB photos  = 550 KB
 * + existing cancellation request QR                  = 150 KB
 * + the order's own fields                            ~   2 KB
 *   -------------------------------------------------------------
 *                                                     ~ 702 KB
 *
 * Comfortably inside the 900 KB ceiling enforced by documentBudget.ts, which
 * itself sits below Firestore's 1 MiB hard limit.
 */

/** Byte length of a data URL as Firestore will count it. */
export function dataUrlByteLength(dataUrl: string): number {
  return new TextEncoder().encode(dataUrl).length;
}

type CompressOptions = {
  /** Longest edge, in pixels, before quality reduction kicks in. */
  maxDimension?: number;
  /** Target byte budget for the resulting data URL. */
  maxBytes?: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image file"));
    };

    image.src = objectUrl;
  });
}

function drawToDataUrl(
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
): string | null {
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;

  // White backdrop: JPEG has no alpha, so a transparent PNG would otherwise
  // render its background as black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Read a file and return a JPEG data URL within `maxBytes`.
 *
 * Steps quality down first (cheap, preserves framing), then reduces dimensions
 * if the budget still is not met. Throws only if the image cannot be decoded at
 * all — otherwise it always returns something within budget.
 */
export async function fileToCompressedDataUrl(
  file: File,
  options: CompressOptions = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? MAX_QR_DATA_URL_BYTES;
  let maxDimension = options.maxDimension ?? 1280;

  const image = await loadImage(file);

  // Four dimension steps, each trying a range of qualities.
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const quality of [0.82, 0.7, 0.58, 0.45, 0.35]) {
      const dataUrl = drawToDataUrl(image, maxDimension, quality);
      if (!dataUrl) throw new Error("Image compression is not supported here");
      if (dataUrlByteLength(dataUrl) <= maxBytes) return dataUrl;
    }
    maxDimension = Math.round(maxDimension * 0.7);
  }

  // Last resort: smallest settings we are willing to produce.
  const fallback = drawToDataUrl(image, 480, 0.3);
  if (!fallback) throw new Error("Image compression is not supported here");
  return fallback;
}
