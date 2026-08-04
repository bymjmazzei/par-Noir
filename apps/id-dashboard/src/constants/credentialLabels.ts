/** User-facing labels for the two knowledge factors. Internal code still uses pnName / passcode. */
export const KEY_1_LABEL = 'Key 1';
export const KEY_2_LABEL = 'Key 2';

export const KEY_1_PLACEHOLDER = 'Enter Key 1';
export const KEY_2_PLACEHOLDER = 'Enter Key 2';
export const KEY_1_CONFIRM_PLACEHOLDER = 'Confirm Key 1';
export const KEY_2_CONFIRM_PLACEHOLDER = 'Confirm Key 2';

export const KEYS_HELPER =
  'Key 1 and Key 2 together unlock your identity. Both are secrets — treat them like passwords.';

export const KEYS_MISMATCH = 'Key 2 entries do not match';
export const KEY_1_MISMATCH = 'Key 1 entries do not match';
export const KEYS_INCORRECT = 'Incorrect Key 1 or Key 2';
export const KEYS_REQUIRED = 'Please enter Key 1 and Key 2';

/** Shared strength rules for Key 1 and Key 2 on create. */
export const KEY_MIN_LENGTH = 8;
export const KEY_MAX_LENGTH = 128;

export const KEY_STRENGTH_RULES = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (v: string) => v.length >= KEY_MIN_LENGTH,
  },
  { id: 'upper', label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v: string) => /[0-9]/.test(v) },
  {
    id: 'special',
    label: 'One special character',
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
] as const;

export function meetsKeyStrengthRequirements(value: string): boolean {
  return (
    value.length <= KEY_MAX_LENGTH && KEY_STRENGTH_RULES.every((rule) => rule.test(value))
  );
}

/** Collect hard-fail strength errors for a knowledge factor. */
export function keyStrengthErrors(value: string, label: string): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'string') {
    errors.push(`${label} must be a non-empty string`);
    return errors;
  }
  if (value.length < KEY_MIN_LENGTH) {
    errors.push(`${label} must be at least ${KEY_MIN_LENGTH} characters long`);
  }
  if (value.length > KEY_MAX_LENGTH) {
    errors.push(`${label} must be no more than ${KEY_MAX_LENGTH} characters long`);
  }
  if (!/[A-Z]/.test(value)) {
    errors.push(`${label} must contain at least one uppercase letter`);
  }
  if (!/[a-z]/.test(value)) {
    errors.push(`${label} must contain at least one lowercase letter`);
  }
  if (!/[0-9]/.test(value)) {
    errors.push(`${label} must contain at least one number`);
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push(`${label} must contain at least one special character`);
  }
  return errors;
}
