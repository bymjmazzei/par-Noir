/**
 * Handle text rules. `normalizePublicName` is the stored form; `confusableSkeleton` is the
 * comparison form used for uniqueness and the protected list, so lookalikes collide.
 */

export const HANDLE_MIN_LENGTH = 2;
export const HANDLE_MAX_LENGTH = 32;

export function normalizePublicName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/** A handle someone may claim: 2–32 of [a-z0-9._-], starting and ending alphanumeric. */
export function isValidHandle(name: string): boolean {
  return (
    name.length >= HANDLE_MIN_LENGTH &&
    name.length <= HANDLE_MAX_LENGTH &&
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(name)
  );
}

/** Cyrillic and Greek letters that render like Latin ones. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', с: 'c', е: 'e', һ: 'h', і: 'i', ј: 'j', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p',
  ѕ: 's', т: 't', у: 'y', х: 'x', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'l',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
};

/** Digits and letters that read as the same glyph in a handle. */
const FOLDS: Record<string, string> = { '0': 'o', '1': 'l', i: 'l', '3': 'e', '5': 's' };

const AFFIXES = ['official', 'real', 'the'];
/** Shorter remainders are left alone so words like `realty` or `theo` keep their own skeleton. */
const AFFIX_MIN_REMAINDER = 4;

function fold(s: string): string {
  let out = '';
  for (const ch of s) out += FOLDS[ch] ?? ch;
  return out;
}

const FOLDED_AFFIXES = AFFIXES.map(fold);

function stripAffixes(s: string): string {
  let cur = s;
  for (let changed = true; changed; ) {
    changed = false;
    for (const affix of FOLDED_AFFIXES) {
      if (cur.length - affix.length < AFFIX_MIN_REMAINDER) continue;
      if (cur.endsWith(affix)) {
        cur = cur.slice(0, -affix.length);
        changed = true;
      } else if (cur.startsWith(affix)) {
        cur = cur.slice(affix.length);
        changed = true;
      }
    }
  }
  return cur;
}

/**
 * Comparison key: lookalike letters to Latin, accents dropped, 0/o 1/l/i 3/e 5/s folded,
 * separators removed, and "official" / "real" / "the" stripped from either end.
 * `c0ke`, `taylor_swift`, and `taylorswiftofficial` share a skeleton with the original.
 */
export function confusableSkeleton(raw: string): string {
  let s = String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  let latin = '';
  for (const ch of s) latin += HOMOGLYPHS[ch] ?? ch;
  s = latin.replace(/[^a-z0-9]/g, '');
  return stripAffixes(fold(s));
}
