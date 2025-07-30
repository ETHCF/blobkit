import { Codec } from '../types.js';

/**
 * JSON codec for serializing JavaScript objects
 */
export class JsonCodec implements Codec {
  public readonly contentType = 'application/json';

  encode(data: unknown): Uint8Array {
    const jsonString = JSON.stringify(data);
    return new TextEncoder().encode(jsonString);
  }

  decode(data: Uint8Array): unknown {
    const jsonString = new TextDecoder().decode(data);
    return JSON.parse(jsonString);
  }
}

/**
 * Raw binary codec for direct byte data
 */
export class RawCodec implements Codec {
  public readonly contentType = 'application/octet-stream';

  encode(data: unknown): Uint8Array {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    throw new Error('Raw codec only supports Uint8Array, ArrayBuffer, or string data');
  }

  decode(data: Uint8Array): Uint8Array {
    return data;
  }
}

/**
 * Text codec for UTF-8 strings
 */
export class TextCodec implements Codec {
  public readonly contentType = 'text/plain';

  encode(data: unknown): Uint8Array {
    if (typeof data !== 'string') {
      throw new Error('Text codec only supports string data');
    }
    return new TextEncoder().encode(data);
  }

  decode(data: Uint8Array): string {
    return new TextDecoder().decode(data);
  }
}

/**
 * Codec registry for managing different encoding formats
 */
export class CodecRegistry {
  private codecs = new Map<string, Codec>();

  constructor() {
    // Register default codecs
    this.register('json', new JsonCodec());
    this.register('raw', new RawCodec());
    this.register('text', new TextCodec());
    this.register('application/json', new JsonCodec());
    this.register('application/octet-stream', new RawCodec());
    this.register('text/plain', new TextCodec());
  }

  /**
   * Register a new codec
   */
  register(name: string, codec: Codec): void {
    this.codecs.set(name.toLowerCase(), codec);
  }

  /**
   * Get a codec by name
   */
  get(name: string): Codec {
    const codec = this.codecs.get(name.toLowerCase());
    if (!codec) {
      throw new Error(`Unknown codec: ${name}`);
    }
    return codec;
  }

  /**
   * Check if a codec exists
   */
  has(name: string): boolean {
    return this.codecs.has(name.toLowerCase());
  }

  /**
   * Get all registered codec names
   */
  getNames(): string[] {
    return Array.from(this.codecs.keys());
  }

  /**
   * Auto-detect codec from data type
   */
  detectCodec(data: unknown): string {
    if (typeof data === 'string') {
      return 'text';
    }
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      return 'raw';
    }
    if (typeof data === 'object' && data !== null) {
      return 'json';
    }
    return 'json'; // Default fallback
  }
}

// Export default registry instance
export const defaultCodecRegistry = new CodecRegistry(); 