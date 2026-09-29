/** Synced viewers must not start a second decoder for the same file. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PenMediaPlayer } from '@par-noir/feed-tile';

const SRC = 'https://example.com/a.mp4';

describe('pen media player decode', () => {
  it('paints a synced viewer on a canvas and does not attach the file to a video', () => {
    const html = renderToStaticMarkup(
      <PenMediaPlayer src={SRC} syncKey="pen-layer:clip" autoPlay={false} />
    );
    expect(html).toContain('<canvas');
    expect(html).not.toContain('<video');
    expect(html).not.toContain(`src="${SRC}"`);
  });

  it('uses one video element when the player is not sharing a master', () => {
    const html = renderToStaticMarkup(<PenMediaPlayer src={SRC} />);
    expect(html.match(/<video/g)?.length).toBe(1);
    expect(html).toContain(`src="${SRC}"`);
    expect(html).not.toContain('<canvas');
  });
});
