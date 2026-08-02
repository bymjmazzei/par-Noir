import { describe, expect, it } from 'vitest';
import {
  areSubjectsSimilar,
  extractSubjects,
  findSimilarSubject,
  levenshteinDistance,
  normalizeSubject,
} from './subjectExtractor';

describe('normalizeSubject', () => {
  it('singularizes a common plural', () => {
    expect(normalizeSubject('cats')).toBe('cat');
    expect(normalizeSubject('boxes')).toBe('box');
    expect(normalizeSubject('stories')).toBe('story');
  });

  it('preserves proper nouns verbatim', () => {
    expect(normalizeSubject('Berlin')).toBe('Berlin');
  });

  it('leaves short words alone rather than stripping them to nothing', () => {
    expect(normalizeSubject('as')).toBe('as');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeSubject('   ')).toBe('');
  });
});

describe('levenshteinDistance', () => {
  it('measures edit distance between two words', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('is zero for identical strings', () => {
    expect(levenshteinDistance('feed', 'feed')).toBe(0);
  });
});

describe('areSubjectsSimilar', () => {
  it('treats case-insensitive matches as similar', () => {
    expect(areSubjectsSimilar('Music', 'music')).toBe(true);
  });

  it('treats substrings as similar', () => {
    expect(areSubjectsSimilar('jazz music', 'jazz')).toBe(true);
  });

  it('keeps unrelated short words apart', () => {
    expect(areSubjectsSimilar('cat', 'dog')).toBe(false);
  });
});

describe('extractSubjects', () => {
  it('normalizes tags and keywords', () => {
    expect(extractSubjects(undefined, ['dogs'], ['tracks'])).toEqual(['dog', 'track']);
  });

  it('skips blank tags', () => {
    expect(extractSubjects(undefined, ['', '   ', 'films'])).toEqual(['film']);
  });

  it('pulls hashtags and quoted phrases out of the description', () => {
    const subjects = extractSubjects('Talking about #synths and "modular rigs" today');
    expect(subjects).toContain('synth');
    expect(subjects).toContain('modular rig');
  });

  it('drops near-duplicate subjects', () => {
    const subjects = extractSubjects(undefined, ['guitar', 'guitars']);
    expect(subjects).toEqual(['guitar']);
  });

  it('returns an empty list when there is nothing to extract', () => {
    expect(extractSubjects()).toEqual([]);
  });
});

describe('findSimilarSubject', () => {
  it('matches a new plural against an existing singular subject', () => {
    expect(findSimilarSubject('guitars', ['guitar', 'drum'])).toBe('guitar');
  });

  it('returns null when nothing is close enough', () => {
    expect(findSimilarSubject('astrophysics', ['guitar', 'drum'])).toBeNull();
  });
});
