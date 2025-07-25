import { Codec, BlobKitError } from '../types';

export const jsonCodec: Codec = {
  encode(data: unknown): Uint8Array {
    try {
      return new TextEncoder().encode(JSON.stringify(data));
    } catch (error) {
      throw new BlobKitError('JSON encode failed', 'JSON_ENCODE_ERROR', error);
    }
  },

  decode(data: Uint8Array): unknown {
    try {
      return JSON.parse(new TextDecoder().decode(data));
    } catch (error) {
      throw new BlobKitError('JSON decode failed', 'JSON_DECODE_ERROR', error);
    }
  }
};
