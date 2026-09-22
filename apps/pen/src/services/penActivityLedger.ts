/** Append-only activity ledger: undo never discards reachable history. */

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
 * Linear past + future. On a new edit after undos, future entries are folded
 * into past (instead of discarded) so later undos can still reach them.
 */
export class ActivityLedger {
  private past: DocSnapshot[] = [];
  private future: DocSnapshot[] = [];

  seed(snapshot: DocSnapshot): void {
    this.past = [cloneSnapshot(snapshot)];
    this.future = [];
  }

  /** Record an edit. Folds any pending future into past first (infinite undo). */
  pushEdit(snapshot: DocSnapshot): void {
    while (this.future.length) {
      this.past.push(this.future.pop()!);
    }
    const next = cloneSnapshot(snapshot);
    const head = this.past[this.past.length - 1];
    if (head && sameSnapshot(head, next)) return;
    this.past.push(next);
  }

  canUndo(): boolean {
    return this.past.length > 1;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): DocSnapshot | null {
    if (this.past.length < 2) return null;
    const cur = this.past.pop()!;
    this.future.push(cur);
    return cloneSnapshot(this.past[this.past.length - 1]!);
  }

  redo(): DocSnapshot | null {
    if (!this.future.length) return null;
    const next = this.future.pop()!;
    this.past.push(next);
    return cloneSnapshot(next);
  }

  depth(): number {
    return this.past.length;
  }
}
