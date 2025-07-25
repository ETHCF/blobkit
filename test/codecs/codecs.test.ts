import {
  registerCodec,
  getCodec,
  hasCodec,
  listCodecs,
  registerDefaultCodecs
} from '../../src/codecs';
import { jsonCodec } from '../../src/codecs/json';
import { rawCodec } from '../../src/codecs/raw';
import { BlobKitError } from '../../src/types';

describe('Codec Registry', () => {
  // Note: No way to clear registry between tests, tests may affect each other

  describe('registerCodec', () => {
    it('should register a valid codec', () => {
      const testCodec = {
        encode: (_data: any) => new Uint8Array([1, 2, 3]),
        decode: (_data: Uint8Array) => ({ test: true })
      };

      registerCodec('test/codec', testCodec);
      expect(hasCodec('test/codec')).toBe(true);
    });

    it('should throw error for invalid codec', () => {
      expect(() => registerCodec('', jsonCodec)).toThrow(BlobKitError);
      expect(() => registerCodec('test', null as any)).toThrow(BlobKitError);
    });

    it('should throw error for codec without encode', () => {
      const invalidCodec = { decode: () => {} } as any;
      expect(() => registerCodec('test', invalidCodec)).toThrow(BlobKitError);
    });

    it('should throw error for codec without decode', () => {
      const invalidCodec = { encode: () => {} } as any;
      expect(() => registerCodec('test', invalidCodec)).toThrow(BlobKitError);
    });
  });

  describe('getCodec', () => {
    it('should return registered codec', () => {
      registerCodec('test/codec', jsonCodec);
      const codec = getCodec('test/codec');

      expect(codec).toBe(jsonCodec);
    });

    it('should return undefined for unknown codec', () => {
      const codec = getCodec('unknown/codec');
      expect(codec).toBeUndefined();
    });
  });

  describe('listCodecs', () => {
    it('should list all registered codecs', () => {
      const initialLength = listCodecs().length;
      
      registerCodec('codec1', jsonCodec);
      registerCodec('codec2', rawCodec);

      const codecs = listCodecs();
      expect(codecs).toContain('codec1');
      expect(codecs).toContain('codec2');
      expect(codecs.length).toBe(initialLength + 2);
    });
  });

  describe('Default Codecs', () => {
    it('should register default codecs', () => {
      registerDefaultCodecs();

      expect(hasCodec('application/json')).toBe(true);
      expect(hasCodec('application/octet-stream')).toBe(true);
    });
  });
});

describe('JSON Codec', () => {
  it('should encode object to Uint8Array', () => {
    const data = { test: true, value: 42 };
    const encoded = jsonCodec.encode(data);

    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('should decode Uint8Array to object', () => {
    const data = { test: true, value: 42 };
    const encoded = jsonCodec.encode(data);
    const decoded = jsonCodec.decode(encoded);

    expect(decoded).toEqual(data);
  });

  it('should throw error for invalid JSON', () => {
    const invalidData = new Uint8Array([123, 34]);
    expect(() => jsonCodec.decode(invalidData)).toThrow(BlobKitError);
  });
});

describe('Raw Codec', () => {
  it('should pass through Uint8Array unchanged', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = rawCodec.encode(data);
    const decoded = rawCodec.decode(encoded);

    expect(encoded).toBe(data);
    expect(decoded).toBe(encoded);
  });

  it('should throw error for non-Uint8Array input', () => {
    expect(() => rawCodec.encode('invalid' as any)).toThrow(BlobKitError);
  });
});
