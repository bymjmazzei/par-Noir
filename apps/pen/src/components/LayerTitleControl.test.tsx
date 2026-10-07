import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LayerTitleControl } from './LayerTitleControl';

describe('LayerTitleControl', () => {
  it('renders save control in edit mode and rename in display mode', () => {
    const editing = renderToStaticMarkup(
      <LayerTitleControl
        label="Layer 1"
        editing
        draft="My layer"
        onStartEdit={() => undefined}
        onDraftChange={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(editing).toContain('Save layer name');
    expect(editing).toContain('Layer title');

    const display = renderToStaticMarkup(
      <LayerTitleControl
        label="Title"
        editing={false}
        draft=""
        onStartEdit={() => undefined}
        onDraftChange={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(display).toContain('Rename layer');
    expect(display).toContain('Title');
  });
});
