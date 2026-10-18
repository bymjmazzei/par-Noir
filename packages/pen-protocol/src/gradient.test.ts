import { describe, expect, it } from 'vitest';
import { formatCssGradient, parseCssGradient } from './gradient.js';

describe('css gradient', () => {
  it('round-trips a linear gradient with rgba stops', () => {
    const spec = parseCssGradient('linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, #ffffff 100%)');
    expect(spec).toEqual({
      type: 'linear',
      angle: 135,
      stops: [
        { color: 'rgba(0, 0, 0, 0.5)', at: 0 },
        { color: '#ffffff', at: 100 }
      ]
    });
    expect(formatCssGradient(spec!)).toBe('linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, #ffffff 100%)');
  });

  it('reads side keywords and spreads stops without positions', () => {
    const spec = parseCssGradient('linear-gradient(to right, red, lime, blue)');
    expect(spec?.angle).toBe(90);
    expect(spec?.stops.map((stop) => stop.at)).toEqual([0, 50, 100]);
  });

  it('parses radial gradients and sorts stops on format', () => {
    const spec = parseCssGradient('radial-gradient(circle at center, #000 0%, #fff 100%)');
    expect(spec?.type).toBe('radial');
    expect(
      formatCssGradient({
        type: 'radial',
        angle: 0,
        stops: [
          { color: '#fff', at: 80 },
          { color: '#000', at: 10 }
        ]
      })
    ).toBe('radial-gradient(circle, #000 10%, #fff 80%)');
  });

  it('rejects non-gradients', () => {
    expect(parseCssGradient('#fff')).toBeNull();
    expect(parseCssGradient('linear-gradient(90deg, #fff)')).toBeNull();
  });
});
