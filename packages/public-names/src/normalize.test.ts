import { describe, expect, it } from 'vitest';
import { confusableSkeleton, isValidHandle, normalizePublicName } from './normalize';

describe('normalizePublicName', () => {
  it('strips @ and lowercases', () => {
    expect(normalizePublicName('@ByMjMazzei')).toBe('bymjmazzei');
    expect(normalizePublicName('  Pepsi ')).toBe('pepsi');
  });
});

describe('isValidHandle', () => {
  it('accepts 2–32 characters that start and end alphanumeric', () => {
    expect(isValidHandle('bymjmazzei')).toBe(true);
    expect(isValidHandle('a.b_c-d')).toBe(true);
    expect(isValidHandle('a')).toBe(false);
    expect(isValidHandle('-abc')).toBe(false);
    expect(isValidHandle('abc.')).toBe(false);
    expect(isValidHandle('a'.repeat(33))).toBe(false);
  });
});

describe('confusableSkeleton', () => {
  it('collides lookalikes with the original', () => {
    const coke = confusableSkeleton('coke');
    expect(confusableSkeleton('c0ke')).toBe(coke);
    expect(confusableSkeleton('COKE')).toBe(coke);
    expect(confusableSkeleton('сoke')).toBe(coke); // Cyrillic с
    expect(confusableSkeleton('cokeofficial')).toBe(coke);
    expect(confusableSkeleton('thecoke')).toBe(coke);

    const taylor = confusableSkeleton('taylorswift');
    expect(confusableSkeleton('taylor_swift')).toBe(taylor);
    expect(confusableSkeleton('taylor.swift')).toBe(taylor);
    expect(confusableSkeleton('taylorswiftofficial')).toBe(taylor);
    expect(confusableSkeleton('realtaylorswift')).toBe(taylor);
    expect(confusableSkeleton('tay1orswift')).toBe(taylor);
  });

  it('folds accents and 1/l/i, 3/e, 5/s', () => {
    expect(confusableSkeleton('café')).toBe(confusableSkeleton('cafe'));
    expect(confusableSkeleton('bi11')).toBe(confusableSkeleton('bill'));
    expect(confusableSkeleton('5h3ll')).toBe(confusableSkeleton('shell'));
  });

  it('keeps distinct names distinct', () => {
    expect(confusableSkeleton('coke')).not.toBe(confusableSkeleton('cake'));
    expect(confusableSkeleton('realty')).not.toBe(confusableSkeleton('ty'));
    expect(confusableSkeleton('theo')).not.toBe(confusableSkeleton('o'));
  });
});
