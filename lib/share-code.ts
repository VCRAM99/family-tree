export const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SHARE_CODE_LENGTH = 8;
export const SHARE_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

function cryptoBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Unbiased sample from the share-code alphabet. Bytes at or above the largest
 * multiple of the alphabet length are discarded so modulo does not bias low characters.
 */
export function generateShareCode(
  length = SHARE_CODE_LENGTH,
  random: (size: number) => Uint8Array = cryptoBytes,
): string {
  const alphabet = SHARE_CODE_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  const chars: string[] = [];
  while (chars.length < length) {
    const bytes = random(length);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      chars.push(alphabet[byte % alphabet.length] ?? "");
      if (chars.length === length) break;
    }
  }
  return chars.join("");
}

export function isShareCode(value: string): boolean {
  return SHARE_CODE_PATTERN.test(value);
}
