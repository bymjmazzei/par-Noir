export type CreateKeysInput = {
  key1: string;
  key1Confirm: string;
  key2: string;
  key2Confirm: string;
};

/** Error message for the Create pN form, or null when the keys are usable. */
export function validateCreateKeys(input: CreateKeysInput): string | null {
  if (!input.key1 || !input.key1Confirm || !input.key2 || !input.key2Confirm) {
    return 'Enter Key 1 and Key 2, then confirm both';
  }
  if (input.key1 !== input.key1Confirm) return 'Key 1 entries do not match';
  if (input.key2 !== input.key2Confirm) return 'Key 2 entries do not match';
  return null;
}
