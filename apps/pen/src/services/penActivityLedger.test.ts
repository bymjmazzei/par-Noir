import { describe, expect, it } from 'vitest';
import { ActivityLedger, type DocSnapshot } from './penActivityLedger';

function snap(title: string, activeSlug = 'body'): DocSnapshot {
  return {
    title,
    activeSlug,
    sections: [{ slug: 'body', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] } }]
  };
}

describe('ActivityLedger', () => {
  it('walks backward and can return to a state left behind by a later edit', () => {
    const ledger = new ActivityLedger();
    ledger.seed(snap('A'));
    ledger.pushEdit(snap('B'));
    ledger.pushEdit(snap('C'));

    expect(ledger.undo()?.title).toBe('B');
    expect(ledger.undo()?.title).toBe('A');
    expect(ledger.canUndo()).toBe(false);

    ledger.pushEdit(snap('D'));
    expect(ledger.undo()?.title).toBe('A');
    expect(ledger.undo()?.title).toBe('B');
    expect(ledger.undo()?.title).toBe('C');
  });

  it('a second undo keeps going back instead of restoring the step just left', () => {
    const ledger = new ActivityLedger();
    ledger.seed(snap('A'));
    ledger.pushEdit(snap('B'));
    ledger.pushEdit(snap('C'));
    expect(ledger.undo()?.title).toBe('B');
    expect(ledger.undo()?.title).toBe('A');
    expect(ledger.redo()?.title).toBe('B');
  });
});
