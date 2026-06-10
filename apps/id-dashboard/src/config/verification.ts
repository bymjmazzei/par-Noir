/** Identity verification (Veriff + Coinbase) feature gates — set at build time. */
export const VERIFF_ENABLED = import.meta.env.VITE_VERIFF_ENABLED === 'true';
export const COINBASE_COMMERCE_ENABLED = import.meta.env.VITE_COINBASE_COMMERCE_ENABLED === 'true';

export function isIdentityVerificationAvailable(): boolean {
  return VERIFF_ENABLED || COINBASE_COMMERCE_ENABLED;
}
