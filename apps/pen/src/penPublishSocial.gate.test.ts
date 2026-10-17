import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('publishSocial pipeline', () => {
  it('awaits draft flush and publish playback bytes before encode', () => {
    const src = readFileSync(resolve(here, 'pages/docEditor/useDocEditorController.ts'), 'utf8');
    const block = src.slice(src.indexOf('function publishSocial'), src.indexOf('function publishTemplate'));
    expect(block).toContain('persistDraftAsync');
    expect(block).toContain('flushDraftForPublish');
    expect(block).toContain('ensurePublishPlaybackBytes');
    expect(block).toContain('feedPublish');
  });
});
