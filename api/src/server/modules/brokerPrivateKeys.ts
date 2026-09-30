const BROKER_PRIVATE_KEYS = new Set([
  'passcode',
  'pnname',
  'pn_name',
  'key1',
  'key2',
  'mlkemsecretkey',
  'mldsasecretkey',
]);

/** Private keys and identity factors are rejected anywhere in the broker body. */
export function brokerPrivateKeyName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (BROKER_PRIVATE_KEYS.has(key.toLowerCase())) return key;
    const nested = brokerPrivateKeyName(child);
    if (nested) return nested;
  }
  return null;
}
