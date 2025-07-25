import { Codec, BlobKitError } from '../types';

const codecs = new Map<string, Codec>();

export function registerCodec(mimeType: string, codec: Codec): void {
  if (!mimeType || !codec?.encode || !codec?.decode) {
    throw new BlobKitError('Invalid codec', 'INVALID_CODEC');
  }
  codecs.set(mimeType, codec);
}

export function getCodec(mimeType: string): Codec | undefined {
  return codecs.get(mimeType);
}

export function hasCodec(mimeType: string): boolean {
  return codecs.has(mimeType);
}

export function listCodecs(): string[] {
  return Array.from(codecs.keys());
}
