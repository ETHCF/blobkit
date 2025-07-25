import { Codec, BlobKitError } from '../types';

export const rawCodec: Codec<Uint8Array> = {
  encode(data: Uint8Array): Uint8Array {
    if (!(data instanceof Uint8Array)) {
      throw new BlobKitError('Expected Uint8Array', 'INVALID_TYPE');
    }
    return data;
  },

  decode(data: Uint8Array): Uint8Array {
    return data;
  }
};
