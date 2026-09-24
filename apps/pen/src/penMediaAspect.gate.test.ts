/**
 * Gate: MP4 track rotation must flip coded landscape into display portrait aspect.
 */

import { describe, it, expect } from 'vitest';
import { readMp4RotationDegrees } from './services/penMediaAspect';

/** Build a minimal buffer containing a version-0 tkhd with a 90° CW matrix. */
function tkhdWithRotation(rot: 0 | 90 | 180 | 270): Uint8Array {
  const buf = new Uint8Array(128);
  // Place 'tkhd' at offset 8
  buf[8] = 0x74;
  buf[9] = 0x6b;
  buf[10] = 0x68;
  buf[11] = 0x64;
  buf[12] = 0; // version 0
  // After version+flags (4) at 12: skip 4+4+4+4+4+8 + 2+2+2+2 = 36 → matrix at 12+4+36 = 52
  const matrixAt = 12 + 4 + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2;
  const view = new DataView(buf.buffer);
  const ONE = 0x00010000;
  let a = ONE;
  let b = 0;
  let c = 0;
  let d = ONE;
  if (rot === 90) {
    a = 0;
    b = ONE;
    c = -ONE;
    d = 0;
  } else if (rot === 270) {
    a = 0;
    b = -ONE;
    c = ONE;
    d = 0;
  } else if (rot === 180) {
    a = -ONE;
    d = -ONE;
  }
  view.setInt32(matrixAt, a);
  view.setInt32(matrixAt + 4, b);
  view.setInt32(matrixAt + 8, c);
  view.setInt32(matrixAt + 12, d);
  return buf;
}

describe('readMp4RotationDegrees', () => {
  it('detects 90° CW track matrix (phone portrait)', () => {
    expect(readMp4RotationDegrees(tkhdWithRotation(90))).toBe(90);
  });

  it('detects 270° and 180°', () => {
    expect(readMp4RotationDegrees(tkhdWithRotation(270))).toBe(270);
    expect(readMp4RotationDegrees(tkhdWithRotation(180))).toBe(180);
  });

  it('returns 0 for identity matrix', () => {
    expect(readMp4RotationDegrees(tkhdWithRotation(0))).toBe(0);
  });
});
