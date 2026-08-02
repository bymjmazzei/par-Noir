import { describe, expect, it } from 'vitest';
import {
  DATA_POINT_CATEGORIES,
  STANDARD_DATA_POINTS,
  getAvailableDataPoints,
  getDataPoint,
  getDataPointsByCategory,
  getStandardDataPointsPublic
} from './catalog';
import { isBlockedDataPoint } from './blocked';

const PRIVACY_LEVELS = ['public', 'private', 'selective'];
const DATA_TYPES = ['string', 'number', 'boolean', 'date', 'object'];

describe('standard data point catalog', () => {
  it('keys every entry by its own id', () => {
    for (const [key, dataPoint] of Object.entries(STANDARD_DATA_POINTS)) {
      expect(dataPoint.id).toBe(key);
    }
  });

  it('has unique ids', () => {
    const ids = getAvailableDataPoints().map((dp) => dp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('populates every required field on every entry', () => {
    for (const dataPoint of getAvailableDataPoints()) {
      expect(dataPoint.id).toMatch(/^[a-z0-9_]+$/);
      expect(dataPoint.name.trim().length).toBeGreaterThan(0);
      expect(dataPoint.description.trim().length).toBeGreaterThan(0);
      expect(DATA_TYPES).toContain(dataPoint.dataType);
      expect(PRIVACY_LEVELS).toContain(dataPoint.defaultPrivacy);
      expect(dataPoint.zkpType.length).toBeGreaterThan(0);
      expect(Array.isArray(dataPoint.examples)).toBe(true);
      expect(dataPoint.examples.length).toBeGreaterThan(0);
    }
  });

  it('only uses categories that have a display label', () => {
    const known = Object.keys(DATA_POINT_CATEGORIES);
    for (const dataPoint of getAvailableDataPoints()) {
      expect(known).toContain(dataPoint.category);
    }
  });

  it('never exposes an identity secret as a standard data point', () => {
    for (const dataPoint of getAvailableDataPoints()) {
      expect(isBlockedDataPoint(dataPoint.id)).toBe(false);
    }
  });

  it('compiles pattern strings into working RegExp objects at runtime', () => {
    const email = STANDARD_DATA_POINTS.email_verification;
    expect(email.validation?.pattern).toBeInstanceOf(RegExp);
    expect(email.validation?.patternSource).toBeTruthy();
    expect(email.validation?.pattern?.test('user@example.com')).toBe(true);
    expect(email.validation?.pattern?.test('not-an-email')).toBe(false);
  });

  it('looks up entries by id and returns undefined for unknown ids', () => {
    expect(getDataPoint('age_attestation')?.name).toBe('Age');
    expect(getDataPoint('not_a_data_point')).toBeUndefined();
  });

  it('filters by category', () => {
    const location = getDataPointsByCategory('location');
    expect(location.length).toBeGreaterThan(0);
    expect(location.every((dp) => dp.category === 'location')).toBe(true);
    expect(getDataPointsByCategory('nope')).toEqual([]);
  });
});

describe('getStandardDataPointsPublic', () => {
  it('covers exactly the same ids as the runtime catalog', () => {
    const publicIds = getStandardDataPointsPublic().map((dp) => dp.id);
    expect(publicIds.sort()).toEqual(Object.keys(STANDARD_DATA_POINTS).sort());
  });

  it('is JSON-safe: patterns are strings, not RegExp', () => {
    const pub = getStandardDataPointsPublic();
    for (const dataPoint of pub) {
      if (dataPoint.validation?.pattern !== undefined) {
        expect(typeof dataPoint.validation.pattern).toBe('string');
      }
    }
    expect(JSON.parse(JSON.stringify(pub))).toEqual(pub);
  });

  it('does not leak the compiled patternSource field', () => {
    for (const dataPoint of getStandardDataPointsPublic()) {
      expect(dataPoint.validation).not.toHaveProperty('patternSource');
    }
  });
});
