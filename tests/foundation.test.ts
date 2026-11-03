import { describe, expect, it } from "vitest";

import { classifyTreeLookup, isValidPublicTag, normalizePublicTag } from "@/lib/public-tag";
import { selectWebpQuality, webpQualitySteps } from "@/lib/photos";
import { SHARE_CODE_ALPHABET, generateShareCode, isShareCode } from "@/lib/share-code";

describe("share codes", () => {
  it("uses the unambiguous alphabet and rejection sampling", () => {
    const codes = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const code = generateShareCode();
      expect(code).toHaveLength(8);
      expect(isShareCode(code)).toBe(true);
      for (const character of code) expect(SHARE_CODE_ALPHABET.includes(character)).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBe(200);

    const limit = 256 - (256 % SHARE_CODE_ALPHABET.length);
    let cursor = 0;
    const stream = [255, 254, limit, limit + 1, 0, 31, 32, 1];
    const sampled = generateShareCode(3, (size) => {
      const bytes = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) {
        bytes[index] = stream[cursor % stream.length] ?? 0;
        cursor += 1;
      }
      return bytes;
    });
    expect(sampled).toHaveLength(3);
    expect(isShareCode(sampled + "23456")).toBe(true);
    expect(sampled.includes("I")).toBe(false);
  });
});

describe("public tags", () => {
  it("accepts 3–40 lowercase letters, numbers, and hyphens", () => {
    expect(isValidPublicTag("ramanathan")).toBe(true);
    expect(normalizePublicTag("  Rama-Family  ")).toBe("rama-family");
    expect(isValidPublicTag("Rama-Family")).toBe(true);
    expect(isValidPublicTag("ab")).toBe(false);
    expect(isValidPublicTag("a".repeat(41))).toBe(false);
    expect(isValidPublicTag("has space")).toBe(false);
    expect(isValidPublicTag("bad_tag")).toBe(false);
    expect(classifyTreeLookup("ABCD2345")).toBe("share_code");
    expect(classifyTreeLookup("heritage")).toBe("public_tag");
    expect(classifyTreeLookup("no")).toBe("invalid");
  });
});

describe("image quality stepping", () => {
  it("starts at 0.82 and steps down until the file fits", () => {
    const steps = webpQualitySteps();
    expect(steps[0]).toBe(0.82);
    expect(steps.at(-1)).toBe(0.4);
    for (let index = 1; index < steps.length; index += 1) {
      expect((steps[index - 1] ?? 0) - (steps[index] ?? 0)).toBeCloseTo(0.06, 2);
    }

    expect(selectWebpQuality(() => 1000)?.quality).toBe(0.82);
    expect(selectWebpQuality((quality) => (quality <= 0.7 ? 1000 : 600_000))?.quality).toBe(0.7);
    expect(selectWebpQuality(() => 600_000)).toBeNull();
  });
});
