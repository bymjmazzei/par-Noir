import { describe, expect, it, beforeEach } from 'vitest';
import {
  configurePenMediaBackend,
  createMemoryPenMediaBackend,
  putLocalMedia,
  getLocalMedia,
  deleteLocalMedia
} from './store';

describe('pen-media memory backend', () => {
  beforeEach(() => {
    configurePenMediaBackend(createMemoryPenMediaBackend());
  });

  it('round-trips a blob', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const put = await putLocalMedia({ docId: 'd1', blob });
    expect(put.ref.startsWith('penlocal:')).toBe(true);
    const hit = await getLocalMedia(put.mediaId);
    expect(hit?.mime).toBe('image/png');
    expect(await hit!.blob.arrayBuffer()).toEqual(await blob.arrayBuffer());
    await deleteLocalMedia(put.mediaId);
    expect(await getLocalMedia(put.mediaId)).toBeNull();
  });
});
