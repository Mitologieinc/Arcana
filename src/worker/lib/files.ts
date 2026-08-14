export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const FILE_TYPES = new Set([
  ...IMAGE_TYPES,
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
]);

export function isAllowedFileType(type: string) {
  return FILE_TYPES.has(type);
}

export function isImageType(type: string) {
  return IMAGE_TYPES.has(type);
}
