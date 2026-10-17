import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@par-noir/pen-media', () => ({ penMediaActivity: () => ({ upload: 1 }) }));

import { LONG_TASK_REPORT_MS, reportLongTask } from './services/longTaskWatch';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');

describe('pen media uploads before editing', () => {
  it('device picks upload to Drive with progress and cancel before the layer exists', () => {
    const src = read('components/CloudFeedMediaPicker.tsx');
    expect(src).toContain('attachMediaFile');
    expect(src).toContain('onProgress');
    expect(src).toContain('abort()');
    expect(src).not.toContain('putLocalMedia');
  });

  it('own audio uploads on attach', () => {
    const src = read('components/MediaEditorPanel.tsx');
    expect(src).toContain('attachMediaFile');
    expect(src).not.toContain('putLocalMedia');
  });

  it('autosave never starts uploads', () => {
    const src = read('pages/docEditor/useDocEditorController.ts');
    expect(src).not.toContain('queueDocMedia');
    expect(src).not.toContain('applyUploadedMediaRefs');
  });

  it('audio waveforms skip files too large to decode on the main thread', () => {
    const src = read('components/SectionTimeline.tsx');
    const body = src.slice(src.indexOf('async function readWave'), src.indexOf('async function readFrames'));
    expect(body).toContain('WAVE_MAX_BYTES');
    expect(body).not.toContain('.slice(0)');
  });
});

describe('long task watch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs stalls with the media work in flight', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportLongTask(LONG_TASK_REPORT_MS - 1, 0);
    expect(warn).not.toHaveBeenCalled();
    reportLongTask(1200, 50);
    expect(warn).toHaveBeenCalledWith('[pen] main thread blocked', '1200ms', {
      atMs: 50,
      media: { upload: 1 }
    });
  });
});
