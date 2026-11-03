export const PHOTO_MAX_BYTES = 524288;
export const PHOTO_EDGE = 512;
export const PHOTO_MIME = "image/webp" as const;
export const PHOTO_INITIAL_QUALITY = 0.82;
export const PHOTO_QUALITY_STEP = 0.06;
export const PHOTO_MIN_QUALITY = 0.4;

const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50] as const;

export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  for (let index = 0; index < WEBP_RIFF.length; index += 1) {
    if (bytes[index] !== WEBP_RIFF[index]) return false;
  }
  for (let index = 0; index < WEBP_WEBP.length; index += 1) {
    if (bytes[index + 8] !== WEBP_WEBP[index]) return false;
  }
  return true;
}

function roundQuality(value: number): number {
  return Math.round(value * 100) / 100;
}

export function webpQualitySteps(options?: {
  initialQuality?: number;
  step?: number;
  minQuality?: number;
}): number[] {
  const step = options?.step ?? PHOTO_QUALITY_STEP;
  const minQuality = options?.minQuality ?? PHOTO_MIN_QUALITY;
  const steps: number[] = [];
  let quality = roundQuality(options?.initialQuality ?? PHOTO_INITIAL_QUALITY);
  steps.push(quality);
  while (quality - step >= minQuality - 1e-9) {
    quality = roundQuality(quality - step);
    steps.push(quality);
  }
  return steps;
}

export function selectWebpQuality(
  sizeAt: (quality: number) => number,
  options?: {
    maxBytes?: number;
    initialQuality?: number;
    step?: number;
    minQuality?: number;
  },
): { quality: number; size: number } | null {
  const maxBytes = options?.maxBytes ?? PHOTO_MAX_BYTES;
  for (const quality of webpQualitySteps(options)) {
    const size = sizeAt(quality);
    if (size <= maxBytes) return { quality, size };
  }
  return null;
}

export async function selectWebpQualityAsync(
  sizeAt: (quality: number) => Promise<number>,
  options?: {
    maxBytes?: number;
    initialQuality?: number;
    step?: number;
    minQuality?: number;
  },
): Promise<{ quality: number; size: number } | null> {
  const maxBytes = options?.maxBytes ?? PHOTO_MAX_BYTES;
  for (const quality of webpQualitySteps(options)) {
    const size = await sizeAt(quality);
    if (size <= maxBytes) return { quality, size };
  }
  return null;
}
