/**
 * @jest-environment node
 */
import {
  DEFAULT_GEMINI_MODEL,
  resolveGeminiModelName,
  resetGeminiModerationServiceForTests,
} from './geminiModerationService';

describe('resolveGeminiModelName', () => {
  const originalModel = process.env.GEMINI_MODEL;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
    resetGeminiModerationServiceForTests();
  });

  it('defaults to gemini-2.0-flash when GEMINI_MODEL is unset', () => {
    delete process.env.GEMINI_MODEL;
    expect(resolveGeminiModelName()).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModelName()).toBe('gemini-2.0-flash');
  });

  it('reads GEMINI_MODEL from env when set', () => {
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    expect(resolveGeminiModelName()).toBe('gemini-2.5-flash');
  });

  it('trims whitespace from GEMINI_MODEL', () => {
    process.env.GEMINI_MODEL = '  gemini-2.0-flash-lite  ';
    expect(resolveGeminiModelName()).toBe('gemini-2.0-flash-lite');
  });
});
