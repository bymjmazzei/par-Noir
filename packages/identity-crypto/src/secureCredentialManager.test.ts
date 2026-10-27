/**
 * Session-lifetime guarantees for SecureCredentialManager.
 *
 * These are regression tests for the memory-only credential contract: Key 1 and
 * Key 2 must be retrievable for the life of a session, must disappear on expiry
 * or clear, and must never be written to any storage surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureCredentialManager } from './secureCredentialManager';

const SESSION = 'session-a';
const OTHER_SESSION = 'session-b';
const KEY1 = 'test-pn-name';
const KEY2 = 'test-key2';

describe('SecureCredentialManager', () => {
  beforeEach(() => {
    SecureCredentialManager.clearAll();
  });

  afterEach(() => {
    SecureCredentialManager.clearAll();
    vi.useRealTimers();
  });

  it('returns the credentials that were set for a session', () => {
    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);

    expect(SecureCredentialManager.getCredentials(SESSION)).toEqual({
      key1: KEY1,
      key2: KEY2,
    });
    expect(SecureCredentialManager.hasCredentials(SESSION)).toBe(true);
  });

  it('returns null for a session that was never set', () => {
    expect(SecureCredentialManager.getCredentials('unknown-session')).toBeNull();
    expect(SecureCredentialManager.hasCredentials('unknown-session')).toBe(false);
  });

  it('keeps sessions isolated from each other', () => {
    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);
    SecureCredentialManager.setCredentials(OTHER_SESSION, 'other-name', 'other-key2');

    expect(SecureCredentialManager.getCredentials(SESSION)?.key1).toBe(KEY1);
    expect(SecureCredentialManager.getCredentials(OTHER_SESSION)?.key1).toBe('other-name');
    expect(SecureCredentialManager.getActiveCredentialsCount()).toBe(2);
  });

  it('overwrites credentials when the same session is set twice', () => {
    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);
    SecureCredentialManager.setCredentials(SESSION, 'rotated-name', 'rotated-key2');

    expect(SecureCredentialManager.getCredentials(SESSION)).toEqual({
      key1: 'rotated-name',
      key2: 'rotated-key2',
    });
    expect(SecureCredentialManager.getActiveCredentialsCount()).toBe(1);
  });

  it('clears only the requested session', () => {
    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);
    SecureCredentialManager.setCredentials(OTHER_SESSION, 'other-name', 'other-key2');

    SecureCredentialManager.clearCredentials(SESSION);

    expect(SecureCredentialManager.getCredentials(SESSION)).toBeNull();
    expect(SecureCredentialManager.getCredentials(OTHER_SESSION)).not.toBeNull();
  });

  it('clearAll removes every session', () => {
    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);
    SecureCredentialManager.setCredentials(OTHER_SESSION, 'other-name', 'other-key2');

    SecureCredentialManager.clearAll();

    expect(SecureCredentialManager.getActiveCredentialsCount()).toBe(0);
    expect(SecureCredentialManager.getCredentials(SESSION)).toBeNull();
    expect(SecureCredentialManager.getCredentials(OTHER_SESSION)).toBeNull();
  });

  it('clearing a session that does not exist is a no-op', () => {
    expect(() => SecureCredentialManager.clearCredentials('never-set')).not.toThrow();
    expect(SecureCredentialManager.getActiveCredentialsCount()).toBe(0);
  });

  it('expires credentials once the requested lifetime has elapsed', () => {
    vi.useFakeTimers();

    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2, 1000);
    expect(SecureCredentialManager.getCredentials(SESSION)).not.toBeNull();

    vi.advanceTimersByTime(1001);

    expect(SecureCredentialManager.getCredentials(SESSION)).toBeNull();
    expect(SecureCredentialManager.hasCredentials(SESSION)).toBe(false);
  });

  it('drops expired sessions from the active count without touching live ones', () => {
    vi.useFakeTimers();

    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2, 1000);
    SecureCredentialManager.setCredentials(OTHER_SESSION, 'other-name', 'other-key2', 60_000);

    vi.advanceTimersByTime(1001);

    expect(SecureCredentialManager.getActiveCredentialsCount()).toBe(1);
    expect(SecureCredentialManager.getCredentials(OTHER_SESSION)).not.toBeNull();
  });

  it('defaults to a 15 minute session lifetime', () => {
    vi.useFakeTimers();

    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);

    vi.advanceTimersByTime(15 * 60 * 1000 - 1);
    expect(SecureCredentialManager.hasCredentials(SESSION)).toBe(true);

    vi.advanceTimersByTime(2);
    expect(SecureCredentialManager.hasCredentials(SESSION)).toBe(false);
  });

  it('never writes credentials to localStorage or sessionStorage', () => {
    const setItem = vi.fn();
    const storage = { setItem, getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);

    SecureCredentialManager.setCredentials(SESSION, KEY1, KEY2);
    SecureCredentialManager.getCredentials(SESSION);
    SecureCredentialManager.clearCredentials(SESSION);

    expect(setItem).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
