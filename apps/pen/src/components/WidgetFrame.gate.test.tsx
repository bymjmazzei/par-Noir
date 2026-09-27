/** The trigger panel sets a preset. It does not arrange layers. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WidgetEditorPanel } from './WidgetEditorPanel';
import type { PenPageLayer, PenSectionContent } from '@par-noir/pen-protocol';

const button: PenPageLayer = {
  id: 'yes',
  kind: 'interactive',
  x: 12,
  y: 48,
  w: 96,
  h: 36,
  zIndex: 2,
  label: 'Yes'
};

const section: PenSectionContent = {
  slug: 'card',
  doc: { type: 'doc', content: [] },
  layers: [
    button,
    {
      id: 'no',
      kind: 'interactive',
      x: 120,
      y: 48,
      w: 96,
      h: 36,
      zIndex: 2,
      label: 'No'
    }
  ]
};

describe('widget trigger panel', () => {
  it('sets a trigger on the selected button and does not lay the group out', () => {
    const html = renderToStaticMarkup(
      <WidgetEditorPanel layer={button} section={section} onSectionChange={() => undefined} />
    );
    expect(html).toContain('Button trigger');
    expect(html).toContain('Vote');
    expect(html).toContain('Submit');
    expect(html).toContain('Allocate');
    expect(html).not.toContain('Add another option');
    expect(html).not.toContain('ASK A QUESTION');
  });

  it('offers the correct-answer mark only on a vote button', () => {
    const vote: PenPageLayer = { ...button, behavior: 'poll.vote', bindRowId: 'yes' };
    const html = renderToStaticMarkup(
      <WidgetEditorPanel layer={vote} section={section} onSectionChange={() => undefined} />
    );
    expect(html).toContain('Correct answer');
    expect(html).toContain('Fill color');
  });

  it('shows the fields each trigger needs', () => {
    const link = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'cta.open', openUrl: 'https://example.com' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(link).toContain('Link');
    const send = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'widget.submit', submitTo: 'a@b.co' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(send).toContain('Submit destination');
    const piles = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'widget.allocate' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(piles).toContain('Allocate amount');
    const reveal = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'widget.reveal' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(reveal).toContain('Reveal target');
  });
});
