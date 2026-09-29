import { describe, expect, it } from 'vitest';
import { proxyRefForFrame, proxySize } from './editProxy';

describe('edit proxy size', () => {
  it('fits a 4K frame to a 720 long edge', () => {
    const sized = proxySize(3840, 2160);
    expect(Math.max(sized.width, sized.height)).toBe(720);
    expect(sized.reuse).toBe(false);
    expect(sized.width % 2).toBe(0);
    expect(sized.height % 2).toBe(0);
  });

  it('reuses the source ref when the frame is already within 720', () => {
    expect(proxySize(640, 360).reuse).toBe(true);
    expect(proxyRefForFrame('penlocal:clip', 640, 360)).toBe('penlocal:clip');
    expect(proxyRefForFrame('penlocal:clip', 720, 1280)).toBeNull();
    expect(proxyRefForFrame('penlocal:clip', 3840, 2160)).toBeNull();
  });
});
