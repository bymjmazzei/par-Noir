function normalizeSubject(subject: string): string {
  const trimmed = subject.trim().toLowerCase();
  if (!trimmed) return '';

  const pluralEndings = [
    { plural: 'ies', singular: 'y' },
    { plural: 'es', singular: '' },
    { plural: 's', singular: '' }
  ];

  const isProperNoun = subject[0] === subject[0].toUpperCase() && subject.length > 1;
  if (isProperNoun) return subject;

  for (const { plural, singular } of pluralEndings) {
    if (trimmed.endsWith(plural)) {
      const base = trimmed.slice(0, -plural.length);
      if (base.length >= 2) return base + singular;
    }
  }

  return trimmed;
}

function areSubjectsSimilar(subject1: string, subject2: string, threshold: number = 2): boolean {
  const s1 = subject1.toLowerCase();
  const s2 = subject2.toLowerCase();
  if (s1 === s2) return true;
  if (s1.includes(s2) || s2.includes(s1)) return true;
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return distance <= threshold && distance / maxLength < 0.3;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[str2.length][str1.length];
}

export function extractSubjects(description?: string, tags?: string[], keywords?: string[]): string[] {
  const subjects = new Set<string>();
  [...(tags || []), ...(keywords || [])].forEach((tag) => {
    if (!tag?.trim()) return;
    const normalized = normalizeSubject(tag);
    if (normalized) subjects.add(normalized);
  });

  if (description) {
    const hashtags = description.match(/#[\w]+/g)?.map((tag) => normalizeSubject(tag.slice(1))).filter(Boolean) || [];
    hashtags.forEach((tag) => subjects.add(tag));
    const quotedPhrases = description.match(/"([^"]+)"/g)?.map((p) => normalizeSubject(p.slice(1, -1))).filter(Boolean) || [];
    quotedPhrases.forEach((phrase) => {
      if (phrase.length > 2) subjects.add(phrase);
    });
  }

  const deduplicated: string[] = [];
  const added = new Set<string>();
  Array.from(subjects).forEach((subject) => {
    let isDuplicate = false;
    for (const addedSubject of added) {
      if (!areSubjectsSimilar(subject, addedSubject)) continue;
      if (subject.length >= addedSubject.length) {
        isDuplicate = true;
        break;
      }
      const index = deduplicated.indexOf(addedSubject);
      if (index !== -1) {
        deduplicated[index] = subject;
        added.delete(addedSubject);
        added.add(subject);
      }
      isDuplicate = false;
      break;
    }
    if (!isDuplicate) {
      deduplicated.push(subject);
      added.add(subject);
    }
  });

  return deduplicated.filter((s) => s.length > 0);
}

export function findSimilarSubject(newSubject: string, existingSubjects: string[]): string | null {
  const normalized = normalizeSubject(newSubject);
  for (const existing of existingSubjects) {
    if (areSubjectsSimilar(normalized, existing)) return existing;
  }
  return null;
}

export { normalizeSubject, areSubjectsSimilar, levenshteinDistance };
