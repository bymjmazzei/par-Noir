/** @vitest-environment jsdom isn't required — static markup asserts the three faces. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WidgetFrame, type WidgetFrameModel } from '@par-noir/feed-tile';

const model: WidgetFrameModel = {
  elements: [
    { id: 'svg', kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
    { id: 'q', kind: 'text', text: 'Ship it?' },
    { id: 'a', kind: 'button', label: 'Yes', optionId: 'opt_yes' },
    { id: 'b', kind: 'button', label: 'No', optionId: 'opt_no' },
    { id: 't', kind: 'time', closesAt: '2026-06-01T00:00:00.000Z' },
    { id: 'h', kind: 'html', html: '<p>note</p>' }
  ],
  counts: { total: 3, byOption: { opt_yes: 2, opt_no: 1 } },
  countdownLabel: '2h 00m 00s',
  closed: false
};

describe('WidgetFrame', () => {
  it('author face edits the question, answers, and duplicate control', () => {
    const html = renderToStaticMarkup(<WidgetFrame model={model} mode="author" />);
    expect(html).toContain('ASK A QUESTION...');
    expect(html).toContain('Ship it?');
    expect(html).toContain('Add another option...');
    expect(html).toContain('Expiry');
    expect(html).toContain('HTML snippet');
    expect(html).toContain('value="Yes"');
  });

  it('shows the tally after a vote when no countdown is hiding it', () => {
    const html = renderToStaticMarkup(
      <WidgetFrame
        model={{ ...model, countdownLabel: undefined, voted: true, closed: false }}
        mode="voter"
      />
    );
    expect(html).toContain('Yes 2');
    expect(html).toContain('No 1');
    expect(html).not.toContain('Add another option...');
  });

  it('shows a countdown instead of the tally while the poll is still open', () => {
    const html = renderToStaticMarkup(
      <WidgetFrame model={{ ...model, voted: true, closed: false }} mode="voter" />
    );
    expect(html).toContain('2h 00m 00s');
    expect(html).not.toContain('Yes 2');
  });
});
