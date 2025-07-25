import { registerCodec } from './registry';
import { jsonCodec } from './json';
import { rawCodec } from './raw';

// Register default codecs
export function registerDefaultCodecs(): void {
  registerCodec('application/json', jsonCodec);
  registerCodec('application/octet-stream', rawCodec);
}

// Export all codec functionality
export * from './registry';
