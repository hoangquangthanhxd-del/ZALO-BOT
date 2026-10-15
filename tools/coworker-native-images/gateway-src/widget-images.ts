import { createHash } from 'node:crypto';

// The Zalo downloader already limits an original to 10 MiB. Keep one turn's
// combined decoded images within that bound, below the 16 MiB HTTP envelope.
export const MAX_NATIVE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_NATIVE_IMAGES = 10;
export type NativeImage = { imageId: string; mimeType: string; data: string; byteSize: number; sha256: string };
export class NativeImageError extends Error {
  constructor(readonly code: string) { super(code); }
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function prepareNativeImages(input: unknown): { input: unknown; images: NativeImage[] } {
  const images: NativeImage[] = [];
  let totalBytes = 0;
  const replacePart = (part: unknown): unknown => {
    if (!record(part) || !['image_url', 'input_image'].includes(String(part.type))) return part;
    const url = typeof part.image_url === 'string' ? part.image_url
      : record(part.image_url) ? part.image_url.url : undefined;
    if (typeof url !== 'string') throw new NativeImageError('native_image_data_required');
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    // Do not fetch client URLs or accept paths: bytes must have been resolved
    // and authorized by the calling Bridge, not by this MCP tool.
    if (!match) throw new NativeImageError('native_image_data_invalid');
    if (images.length >= MAX_NATIVE_IMAGES || match[2].length > Math.ceil(MAX_NATIVE_IMAGE_BYTES / 3) * 4) {
      throw new NativeImageError('native_image_limit_exceeded');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.toString('base64') !== match[2]) throw new NativeImageError('native_image_data_invalid');
    totalBytes += bytes.length;
    if (totalBytes > MAX_NATIVE_IMAGE_BYTES) throw new NativeImageError('native_image_limit_exceeded');
    const mimeType = match[1];
    const valid = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!valid) throw new NativeImageError('native_image_signature_invalid');
    const imageId = part.image_id === undefined ? 'image-' + (images.length + 1) : part.image_id;
    if (typeof imageId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(imageId)
      || images.some(image => image.imageId === imageId)) throw new NativeImageError('native_image_id_invalid');
    images.push({ imageId, mimeType, data: match[2], byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') });
    return { type: 'image_reference', image_id: imageId, image_index: images.length - 1,
      mime_type: mimeType, byte_size: bytes.length };
  };
  const prepareItem = (item: unknown): unknown => record(item) && Array.isArray(item.content)
    ? { ...item, content: item.content.map(replacePart) } : replacePart(item);
  const prepared = Array.isArray(input) ? input.map(prepareItem) : prepareItem(input);
  return { input: prepared, images };
}
