/** Append-only visit log. Undo walks backward. A later edit keeps the states already visited. */

import type { PenSectionContent } from '@par-noir/pen-protocol';

export type DocSnapshot = {
  title: string;
  sections: PenSectionContent[];
  activeSlug: string;
};

function cloneSnapshot(s: DocSnapshot): DocSnapshot {
  return JSON.parse(JSON.stringify(s)) as DocSnapshot;
}

function sameSnapshot(a: DocSnapshot, b: DocSnapshot): boolean {
  return (
    a.title === b.title &&
    a.activeSlug === b.activeSlug &&
    JSON.stringify(a.sections) === JSON.stringify(b.sections)
  );
}

/**
 * The current snapshot is `log[index]`. Undo only moves the index back.
 * An edit from the middle appends, and keeps the states between the old
 * index and the tip, so later undos can walk back onto them.
 */
export class ActivityLedger {
  private log: DocSnapshot[] = [];
  private index = 0;

  seed(snapshot: DocSnapshot): void {
    this.log = [cloneSnapshot(snapshot)];
    this.index = 0;
  }

  /** Record an edit. Does not drop states the user has already visited. */
  pushEdit(snapshot: DocSnapshot): void {
    const next = cloneSnapshot(snapshot);
    const head = this.log[this.index];
    if (head && sameSnapshot(head, next)) return;
    if (this.index < this.log.length - 1) {
      const later = this.log.slice(this.index + 1);
      const branch = this.log[this.index];
      this.log = [
        ...this.log,
        ...later.slice().reverse().slice(1),
        ...(branch ? [cloneSnapshot(branch)] : []),
        next
      ];
    } else {
      this.log.push(next);
    }
    this.index = this.log.length - 1;
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.log.length - 1;
  }

  undo(): DocSnapshot | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return cloneSnapshot(this.log[this.index]!);
  }

  redo(): DocSnapshot | null {
    if (this.index >= this.log.length - 1) return null;
    this.index += 1;
    return cloneSnapshot(this.log[this.index]!);
  }

  depth(): number {
    return this.log.length;
  }
}
