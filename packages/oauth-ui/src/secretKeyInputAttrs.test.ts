import { describe, expect, it } from 'vitest';
import {
  SECRET_KEY_1_NAME,
  SECRET_KEY_2_NAME,
  SECRET_KEY_FORM_ATTRS,
  secretKeyHtmlAttrs,
  secretKeyInputProps,
} from './secretKeyInputAttrs';

describe('secretKeyInputProps', () => {
  it('unlock mode: both keys are password with autocomplete off', () => {
    const key1 = secretKeyInputProps('key1', 'unlock');
    const key2 = secretKeyInputProps('key2', 'unlock');
    expect(key1.type).toBe('password');
    expect(key2.type).toBe('password');
    expect(key1.autoComplete).toBe('off');
    expect(key2.autoComplete).toBe('off');
    expect(key1.name).toBe(SECRET_KEY_1_NAME);
    expect(key2.name).toBe(SECRET_KEY_2_NAME);
  });

  it('create mode uses new-password, never username', () => {
    const key1 = secretKeyInputProps('key1', 'create');
    const key2 = secretKeyInputProps('key2', 'create');
    expect(key1.autoComplete).toBe('new-password');
    expect(key2.autoComplete).toBe('new-password');
    expect(JSON.stringify(key1)).not.toContain('username');
    expect(JSON.stringify(key2)).not.toContain('username');
  });

  it('includes vendor password-manager ignore attrs', () => {
    const props = secretKeyInputProps('key1');
    expect(props['data-1p-ignore']).toBe(true);
    expect(props['data-lpignore']).toBe('true');
    expect(props['data-bwignore']).toBe(true);
    expect(props['data-form-type']).toBe('other');
    expect(props.spellCheck).toBe(false);
    expect(props.autoCapitalize).toBe('off');
    expect(props.autoCorrect).toBe('off');
  });

  it('defaults mode to unlock', () => {
    expect(secretKeyInputProps('key2').autoComplete).toBe('off');
  });

  it('form attrs disable autocomplete', () => {
    expect(SECRET_KEY_FORM_ATTRS.autoComplete).toBe('off');
  });

  it('html attrs mirror react props for static templates', () => {
    const html = secretKeyHtmlAttrs('key1', 'unlock');
    expect(html.type).toBe('password');
    expect(html.name).toBe(SECRET_KEY_1_NAME);
    expect(html.id).toBe('pn-key-1');
    expect(html.autocomplete).toBe('off');
    expect(html['data-1p-ignore']).toBe('true');
  });
});
