import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import { env } from "../../config/env.js";
import {
  BadRequestError,
  InternalError,
  ServiceUnavailableError,
} from "../../core/CustomError.js";
import Logger from "../../core/Logger.js";

const maxImageSize = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function getCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
    throw new ServiceUnavailableError("Image uploads are not configured");
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
  };
}

export function parseHelpImage(req: Request): {
  buffer: Buffer;
  contentType: string;
} {
  const contentType = req.get("content-type")?.split(";")[0]?.toLowerCase();
  if (!contentType || !allowedImageTypes.has(contentType))
    throw new BadRequestError("Upload a JPEG, PNG, or WebP image");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0)
    throw new BadRequestError("Image file is required");
  if (req.body.length > maxImageSize)
    throw new BadRequestError("Images must be 5 MB or smaller");
  const buffer: Buffer = req.body;
  const isJpeg =
    contentType === "image/jpeg" &&
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    contentType === "image/png" &&
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    contentType === "image/webp" &&
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp)
    throw new BadRequestError("Image content does not match its file type");
  return { buffer: req.body, contentType };
}

export async function uploadHelpImage(
  buffer: Buffer,
  contentType: string,
  folder: string,
): Promise<string> {
  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = randomUUID();
  const signature = sha1(
    `folder=${folder}&overwrite=false&public_id=${publicId}&timestamp=${timestamp}${config.apiSecret}`,
  );
  const form = new FormData();
  const fileBytes = new Uint8Array(buffer.byteLength);
  fileBytes.set(buffer);
  form.set("file", new Blob([fileBytes], { type: contentType }));
  form.set("api_key", config.apiKey);
  form.set("timestamp", timestamp);
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("overwrite", "false");
  form.set("signature", signature);

  let response: globalThis.Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
      { method: "POST", body: form },
    );
  } catch (error) {
    Logger.error("Cloudinary image upload request failed", error);
    throw new InternalError("Image upload failed");
  }

  if (!response.ok) {
    Logger.error(`Cloudinary image upload returned HTTP ${response.status}`);
    throw new InternalError("Image upload failed");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch (error) {
    Logger.error("Cloudinary image upload returned invalid JSON", error);
    throw new InternalError("Image upload failed");
  }
  if (
    typeof result !== "object" ||
    result === null ||
    !("secure_url" in result) ||
    typeof result.secure_url !== "string"
  ) {
    Logger.error("Cloudinary image upload returned an invalid response");
    throw new InternalError("Image upload failed");
  }
  return result.secure_url;
}

export { maxImageSize };
