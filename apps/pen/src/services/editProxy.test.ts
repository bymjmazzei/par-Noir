import { describe, expect, it } from 'vitest';
import {
  layerOriginalForProxy,
  presentationAwaitingEditProxy,
  proxyRefForFrame,
  proxySize,
  reverseProxyAllowed,
  sectionAwaitingEditProxy
} from './editProxy';
import type { PenSectionContent } from '@par-noir/pen-protocol';

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

  it('builds a reversed proxy only for clips of 15 seconds or less', () => {
    expect(reverseProxyAllowed(15)).toBe(true);
    expect(reverseProxyAllowed(15.01)).toBe(false);
    expect(reverseProxyAllowed(0)).toBe(false);
  });
});

describe('edit proxy awaiting', () => {
  const emptySection: PenSectionContent = { slug: 'p', layers: [] };

  it('detects page background without editProxySrc', () => {
    expect(presentationAwaitingEditProxy({ backgroundVideo: 'penlocal:v' })).toBe(true);
    expect(
      presentationAwaitingEditProxy({ backgroundVideo: 'penlocal:v', editProxySrc: 'penlocal:p' })
    ).toBe(false);
  });

  it('detects video layers missing editProxySrc', () => {
    const section: PenSectionContent = {
      slug: 'p',
      layers: [
        {
          id: 'v',
          kind: 'video',
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          zIndex: 1,
          videoSrc: 'penlocal:clip'
        }
      ]
    };
    expect(layerOriginalForProxy(section.layers![0]!)).toBe('penlocal:clip');
    expect(sectionAwaitingEditProxy(section)).toBe(true);
    expect(sectionAwaitingEditProxy(emptySection)).toBe(false);
  });
});
