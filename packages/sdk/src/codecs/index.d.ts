import { Codec } from '../types.js';
/**
 * JSON codec for serializing JavaScript objects
 */
export declare class JsonCodec implements Codec {
    readonly contentType = "application/json";
    encode(data: unknown): Uint8Array;
    decode(data: Uint8Array): unknown;
}
/**
 * Raw binary codec for direct byte data
 */
export declare class RawCodec implements Codec {
    readonly contentType = "application/octet-stream";
    encode(data: unknown): Uint8Array;
    decode(data: Uint8Array): Uint8Array;
}
/**
 * Text codec for UTF-8 strings
 */
export declare class TextCodec implements Codec {
    readonly contentType = "text/plain";
    encode(data: unknown): Uint8Array;
    decode(data: Uint8Array): string;
}
/**
 * Codec registry for managing different encoding formats
 */
export declare class CodecRegistry {
    private codecs;
    constructor();
    /**
     * Register a new codec
     */
    register(name: string, codec: Codec): void;
    /**
     * Get a codec by name
     */
    get(name: string): Codec;
    /**
     * Check if a codec exists
     */
    has(name: string): boolean;
    /**
     * Get all registered codec names
     */
    getNames(): string[];
    /**
     * Auto-detect codec from data type
     */
    detectCodec(data: unknown): string;
}
export declare const defaultCodecRegistry: CodecRegistry;
//# sourceMappingURL=index.d.ts.map