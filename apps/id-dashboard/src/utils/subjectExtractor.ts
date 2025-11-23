/**
 * Subject Extraction Utility
 * Extracts and normalizes subject niches from content metadata
 * Handles plural normalization, proper noun detection, and misspelling detection
 */

/**
 * Normalize subject to singular form (unless it's a proper noun)
 * Examples: "cowboys" -> "cowboy", "Cowboys" (team) -> "Cowboys"
 */
function normalizeSubject(subject: string): string {
  const trimmed = subject.trim().toLowerCase();
  if (!trimmed) return '';
  
  // Common plural endings
  const pluralEndings = [
    { plural: 'ies', singular: 'y' }, // cities -> city
    { plural: 'es', singular: '' },   // boxes -> box
    { plural: 's', singular: '' }    // cats -> cat
  ];
  
  // Check if it's likely a proper noun (starts with capital in original)
  const isProperNoun = subject[0] === subject[0].toUpperCase() && subject.length > 1;
  if (isProperNoun) {
    // Keep proper nouns as-is (e.g., "Cowboys" football team)
    return subject;
  }
  
  // Try to normalize plurals
  for (const { plural, singular } of pluralEndings) {
    if (trimmed.endsWith(plural)) {
      const base = trimmed.slice(0, -plural.length);
      // Don't normalize if base is too short (e.g., "is" -> "i")
      if (base.length >= 2) {
        return base + singular;
      }
    }
  }
  
  return trimmed;
}

/**
 * Check if two subjects are similar (for misspelling detection)
 * Uses Levenshtein distance for fuzzy matching
 */
function areSubjectsSimilar(subject1: string, subject2: string, threshold: number = 2): boolean {
  const s1 = subject1.toLowerCase();
  const s2 = subject2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return true;
  
  // One contains the other (e.g., "cowboy" and "cowboys")
  if (s1.includes(s2) || s2.includes(s1)) return true;
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  // If distance is small relative to length, consider similar
  return distance <= threshold && distance / maxLength < 0.3;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Extract subject niches from description, tags, and keywords
 * Returns normalized, deduplicated subjects
 */
export function extractSubjects(
  description?: string,
  tags?: string[],
  keywords?: string[]
): string[] {
  const subjects = new Set<string>();
  
  // Add tags/keywords as subjects (normalized)
  [...(tags || []), ...(keywords || [])].forEach(tag => {
    if (tag && tag.trim()) {
      const normalized = normalizeSubject(tag);
      if (normalized) {
        subjects.add(normalized);
      }
    }
  });
  
  // Extract from description
  if (description) {
    // Extract hashtags
    const hashtags = description.match(/#[\w]+/g)?.map(tag => {
      const tagText = tag.slice(1); // Remove #
      return normalizeSubject(tagText);
    }).filter(Boolean) || [];
    hashtags.forEach(tag => subjects.add(tag));
    
    // Extract quoted phrases
    const quotedPhrases = description.match(/"([^"]+)"/g)?.map(p => {
      const phrase = p.slice(1, -1); // Remove quotes
      return normalizeSubject(phrase);
    }).filter(Boolean) || [];
    quotedPhrases.forEach(phrase => {
      if (phrase.length > 2) { // Only add phrases longer than 2 chars
        subjects.add(phrase);
      }
    });
  }
  
  // Deduplicate similar subjects
  const deduplicated: string[] = [];
  const added = new Set<string>();
  
  Array.from(subjects).forEach(subject => {
    // Check if we've already added a similar subject
    let isDuplicate = false;
    for (const addedSubject of added) {
      if (areSubjectsSimilar(subject, addedSubject)) {
        // Keep the shorter/more common version
        if (subject.length >= addedSubject.length) {
          isDuplicate = true;
          break;
        } else {
          // Replace with shorter version
          const index = deduplicated.indexOf(addedSubject);
          if (index !== -1) {
            deduplicated[index] = subject;
            added.delete(addedSubject);
            added.add(subject);
          }
          isDuplicate = false;
          break;
        }
      }
    }
    
    if (!isDuplicate) {
      deduplicated.push(subject);
      added.add(subject);
    }
  });
  
  return deduplicated.filter(s => s.length > 0);
}

/**
 * Check if a subject is similar to existing subjects (for misspelling detection)
 * Returns the most similar existing subject if found, null otherwise
 */
export function findSimilarSubject(
  newSubject: string,
  existingSubjects: string[]
): string | null {
  const normalized = normalizeSubject(newSubject);
  
  for (const existing of existingSubjects) {
    if (areSubjectsSimilar(normalized, existing)) {
      return existing;
    }
  }
  
  return null;
}

