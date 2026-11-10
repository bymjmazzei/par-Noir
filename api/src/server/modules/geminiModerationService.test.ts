/**
 * @jest-environment node
 */
import {
  DEFAULT_GEMINI_MODEL,
  parsePublishLaneResponse,
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

  it('defaults to the rolling flash alias when GEMINI_MODEL is unset', () => {
    delete process.env.GEMINI_MODEL;
    expect(resolveGeminiModelName()).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModelName()).toBe('gemini-flash-latest');
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

describe('parsePublishLaneResponse', () => {
  it('maps prohibited / nsfw / public', () => {
    expect(parsePublishLaneResponse({ lane: 'prohibited' }).lane).toBe('prohibited');
    expect(parsePublishLaneResponse({ lane: 'NSFW', confidence: 0.9 }).lane).toBe('nsfw');
    expect(parsePublishLaneResponse({ lane: 'public', reason: 'ok' }).reason).toBe('ok');
  });

  it('defaults invalid lane to public', () => {
    expect(parsePublishLaneResponse({}).lane).toBe('public');
    expect(parsePublishLaneResponse({ lane: 'weird' }).lane).toBe('public');
  });
});
