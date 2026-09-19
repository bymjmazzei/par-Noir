/**
 * Autofill / password-manager suppress attrs for Key 1 and Key 2 inputs.
 *
 * Both knowledge factors are secrets. Markup must not look like a username/password
 * login (no type=text Key 1, no autocomplete=username, no name=username).
 */

export type SecretKeyWhich = 'key1' | 'key2';
export type SecretKeyMode = 'unlock' | 'create';

export const SECRET_KEY_1_NAME = 'pn-key-1';
export const SECRET_KEY_2_NAME = 'pn-key-2';
export const SECRET_KEY_1_ID = 'pn-key-1';
export const SECRET_KEY_2_ID = 'pn-key-2';

/** Spread onto parent <form> when wrapping Key 1 / Key 2 fields. */
export const SECRET_KEY_FORM_ATTRS = {
  autoComplete: 'off' as const,
};

export type SecretKeyInputProps = {
  type: 'password';
  name: string;
  autoComplete: 'off' | 'new-password';
  spellCheck: false;
  autoCapitalize: 'off';
  autoCorrect: 'off';
  'data-1p-ignore': true;
  'data-lpignore': 'true';
  'data-bwignore': true;
  'data-form-type': 'other';
};

/**
 * Props safe to spread onto a Key 1 or Key 2 <input />.
 * Callers with eye-toggles should override `type` after spreading when visible.
 */
export function secretKeyInputProps(
  which: SecretKeyWhich,
  mode: SecretKeyMode = 'unlock'
): SecretKeyInputProps {
  const isKey1 = which === 'key1';
  return {
    type: 'password',
    name: isKey1 ? SECRET_KEY_1_NAME : SECRET_KEY_2_NAME,
    autoComplete: mode === 'create' ? 'new-password' : 'off',
    spellCheck: false,
    autoCapitalize: 'off',
    autoCorrect: 'off',
    'data-1p-ignore': true,
    'data-lpignore': 'true',
    'data-bwignore': true,
    'data-form-type': 'other',
  };
}

/** HTML attribute bag for static templates (oauth-consent.html). */
export function secretKeyHtmlAttrs(
  which: SecretKeyWhich,
  mode: SecretKeyMode = 'unlock'
): Record<string, string> {
  const props = secretKeyInputProps(which, mode);
  return {
    type: props.type,
    name: props.name,
    id: which === 'key1' ? SECRET_KEY_1_ID : SECRET_KEY_2_ID,
    autocomplete: props.autoComplete,
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
  };
}
