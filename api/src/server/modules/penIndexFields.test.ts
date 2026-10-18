import { penIndexFields, penPostUpdateClearKeys } from './penIndexFields';

describe('penIndexFields', () => {
  it('keeps feed ids and a real template kind', () => {
    const fields = penIndexFields({
      feedIds: ['notes', ''],
      penDocId: 'doc-1',
      penTemplateKind: 'template',
      licensing: { family: 'unconditionalFree', contracts: [] }
    });
    expect(fields.feedIds).toEqual(['notes']);
    expect(fields.penDocId).toBe('doc-1');
    expect(fields.penTemplateKind).toBe('template');
    const overlays = penIndexFields({
      actionOverlays: [{ layerId: 'b', behavior: 'widget.toggle', spreadsheetId: 'sheet-user' }]
    });
    expect(overlays.actionOverlays).toEqual([
      { layerId: 'b', behavior: 'widget.toggle', spreadsheetId: 'sheet-user' }
    ]);
    expect(penIndexFields({ actionStageHtml: '<button>Yes</button>' }).actionStageHtml).toBe(
      '<button>Yes</button>'
    );
    expect(penIndexFields({ actionStageHtml: '  ' }).actionStageHtml).toBeUndefined();
    expect(
      penIndexFields({ companionAudioFileIds: ['a', ''], musicPenDocId: 'music-doc' })
        .companionAudioFileIds
    ).toEqual(['a']);
    expect(
      penIndexFields({ penPostUpdatedAt: '2026-01-02T00:00:00.000Z' }).penPostUpdatedAt
    ).toBe('2026-01-02T00:00:00.000Z');
  });

  it('drops a template kind that is not template or remix', () => {
    expect(penIndexFields({ penTemplateKind: 'nope' }).penTemplateKind).toBeUndefined();
  });

  it('penPostUpdateClearKeys lists absent Pen fields for replace semantics', () => {
    const keys = penPostUpdateClearKeys({
      penDocId: 'doc-1',
      textPost: { content: 'hi' },
      feedPoster: { r2Key: 'new' }
    });
    expect(keys).toContain('penFeedPage');
    expect(keys).toContain('collection');
    expect(keys).toContain('feedPreviewSd');
    expect(keys).not.toContain('penDocId');
    expect(keys).not.toContain('textPost');
    expect(keys).not.toContain('feedPoster');
  });
});
