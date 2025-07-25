import { loadTrustedSetup, createMockSetup } from './kzg';

/**
 * Initialize with mock trusted setup for development.
 * ⚠️ DO NOT use in production - uses known tau value.
 */
export async function initializeForDevelopment(): Promise<void> {
  const setup = createMockSetup();
  loadTrustedSetup(setup);
}

/**
 * Initialize with official Ethereum KZG trusted setup.
 * Download files from: https://github.com/ethereum/kzg-ceremony-sequencer
 */
export async function initializeForProduction(
  g1Path: string,
  g2Path: string,
  format: 'binary' | 'text' = 'text'
): Promise<void> {
  const { loadTrustedSetupFromBinary, loadTrustedSetupFromText } = await import('./kzg/setup');

  const setup = format === 'binary'
    ? await loadTrustedSetupFromBinary(g1Path, g2Path)
    : await loadTrustedSetupFromText(g1Path, g2Path);

  loadTrustedSetup(setup);
}
