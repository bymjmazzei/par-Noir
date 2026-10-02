/**
 * @jest-environment node
 */
import { classifyRootBlob } from './rootBlobLayout';

describe('classifyRootBlob', () => {
  it('sends notes, thoughts, and their thumbs to notes', () => {
    expect(classifyRootBlob('note-123.note').kind).toBe('notes');
    expect(classifyRootBlob('note-123.note.encrypted').kind).toBe('notes');
    expect(classifyRootBlob('thought-9.thought').kind).toBe('notes');
    expect(classifyRootBlob('thought-9.png').kind).toBe('notes');
    expect(classifyRootBlob('thumb_note-1.png.encrypted').kind).toBe('notes');
    expect(classifyRootBlob('thumb_thought-1.png').kind).toBe('notes');
  });

  it('sends collections to collections and other thumbs, images, and posters to media', () => {
    expect(classifyRootBlob('note-collection-1.note-collection').kind).toBe('collections');
    expect(classifyRootBlob('album.thought-collection').kind).toBe('collections');
    expect(classifyRootBlob('thumb_photo.jpg.encrypted').kind).toBe('media');
    expect(classifyRootBlob('photo.jpg.encrypted').kind).toBe('media');
    expect(classifyRootBlob('feed-preview-abc-poster').kind).toBe('media');
    expect(classifyRootBlob('public-envelope-abc.json').kind).toBe('media');
    expect(classifyRootBlob('scan.pdf').kind).toBe('media');
  });

  it('sends pen prefs, media, and published envelopes to pen homes', () => {
    expect(classifyRootBlob('par-noir-pen-prefs.enc').kind).toBe('pen-prefs');
    expect(classifyRootBlob('media-abc.penmedia').kind).toBe('pen-media');
    expect(classifyRootBlob('gallery-preview-poster.penmedia').kind).toBe('pen-media');
    expect(classifyRootBlob('pen-doc1.json')).toEqual({ kind: 'pen-public', docKey: 'doc1' });
    expect(classifyRootBlob('pen-doc1.collection.json')).toEqual({
      kind: 'pen-public',
      docKey: 'doc1',
    });
    expect(classifyRootBlob('pen-doc1-audio-2.mp3')).toEqual({
      kind: 'pen-public',
      docKey: 'doc1',
    });
    expect(classifyRootBlob('pen-template-doc1.json')).toEqual({
      kind: 'pen-public',
      docKey: 'doc1',
    });
  });

  it('sends unrecognized cabinet files to files', () => {
    expect(classifyRootBlob('notes.txt.encrypted').kind).toBe('files');
  });
});
