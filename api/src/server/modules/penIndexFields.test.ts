import { penIndexFields } from './penIndexFields';

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
    expect(
      penIndexFields({ companionAudioFileIds: ['a', ''], musicPenDocId: 'music-doc' })
        .companionAudioFileIds
    ).toEqual(['a']);
  });

  it('drops a template kind that is not template or remix', () => {
    expect(penIndexFields({ penTemplateKind: 'nope' }).penTemplateKind).toBeUndefined();
  });
});
