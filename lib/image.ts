"use client";

import { PHOTO_EDGE, selectWebpQualityAsync } from "@/lib/photos";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode that image as WebP."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

/** Center-crops to a square, resizes to 512×512, and steps WebP quality down from 0.82 until the file is ≤ 512 KB. */
export async function preparePersonPhoto(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const originX = (bitmap.width - side) / 2;
    const originY = (bitmap.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_EDGE;
    canvas.height = PHOTO_EDGE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, originX, originY, side, side, 0, 0, PHOTO_EDGE, PHOTO_EDGE);

    const chosen = await selectWebpQualityAsync(async (quality) => (await canvasToBlob(canvas, quality)).size);
    if (!chosen) {
      throw new Error("That image is still larger than 512 KB after compression.");
    }
    return canvasToBlob(canvas, chosen.quality);
  } finally {
    bitmap.close();
  }
}
