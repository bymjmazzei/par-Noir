/**
 * Longform compiler — sequence of atoms (units).
 * Viewer: vertical scroll within a unit; horizontal / tree between units.
 * Library Book / Article are compile targets, not a separate media zoo.
 */

import type { PenSectionContent } from './types.js';

export type LongformUnit = {
  /** Stable unit id (usually a section slug or atom doc id). */
  unitId: string;
  title?: string;
  /** Atom class / template id when unit is a ref. */
  atomClassId?: string;
  atomTemplateId?: string;
  atomDocId?: string;
  /** Sections that make up this unit (vertical within). */
  sections: PenSectionContent[];
};

export type LongformSequence = {
  title: string;
  /** Ordered units — horizontal / tree navigation between these. */
  units: LongformUnit[];
  /** Default swipe: y within unit, x between units. */
  withinUnitAxis: 'y';
  betweenUnitAxis: 'x' | 'tree';
};

/** Build a longform sequence from ordered sections (one unit per section by default). */
export function sectionsToLongformUnits(
  title: string,
  sections: PenSectionContent[],
  opts?: { groupByPrefix?: boolean }
): LongformSequence {
  if (opts?.groupByPrefix) {
    const groups = new Map<string, PenSectionContent[]>();
    for (const sec of sections) {
      const key = sec.slug.includes('.') ? sec.slug.split('.')[0]! : sec.slug;
      const list = groups.get(key) || [];
      list.push(sec);
      groups.set(key, list);
    }
    const units: LongformUnit[] = [...groups.entries()].map(([unitId, secs]) => ({
      unitId,
      title: unitId,
      sections: secs
    }));
    return {
      title,
      units,
      withinUnitAxis: 'y',
      betweenUnitAxis: 'x'
    };
  }
  return {
    title,
    units: sections.map((sec) => ({
      unitId: sec.slug,
      title: sec.slug,
      sections: [sec]
    })),
    withinUnitAxis: 'y',
    betweenUnitAxis: 'x'
  };
}

/** Next / prev unit helpers for horizontal edge navigation. */
export function adjacentUnit(
  seq: LongformSequence,
  unitId: string,
  dir: 'prev' | 'next'
): LongformUnit | null {
  const idx = seq.units.findIndex((u) => u.unitId === unitId);
  if (idx < 0) return null;
  const next = dir === 'next' ? idx + 1 : idx - 1;
  return seq.units[next] || null;
}
