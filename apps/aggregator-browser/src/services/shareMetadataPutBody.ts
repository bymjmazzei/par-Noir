/**
 * Fields required on metadata-index PUT so the API defers companion Drive work for notes.
 */
const PEN_INDEX_KEYS = [
  'contentClass',
  'headProof',
  'templateId',
  'penDocId',
  'penClassId',
  'penCategoryId',
  'penTemplateKind',
  'basedOnTemplateId',
  'penIrRef',
  'licensing',
  'musicPenDocId',
  'musicLicensing',
] as const;

export function catalogFieldsForMetadataPut(
  existingMetadata: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!existingMetadata) return {};

  const out: Record<string, unknown> = {};
  const fileType =
    typeof existingMetadata.fileType === 'string' ? existingMetadata.fileType : '';
  if (fileType) out.fileType = fileType;

  const ft = fileType.toLowerCase();
  const isNoteThumb =
    existingMetadata.isNoteThumbnail === true ||
    ft === 'note-thumbnail' ||
    ft === 'note-collection-thumbnail';
  if (isNoteThumb) {
    out.isNoteThumbnail = true;
    out.contentClass = 'note';
  }

  if (typeof existingMetadata.mainFileId === 'string' && existingMetadata.mainFileId) {
    out.mainFileId = existingMetadata.mainFileId;
  }
  if (typeof existingMetadata.name === 'string' && existingMetadata.name) {
    out.name = existingMetadata.name;
  }
  if (typeof existingMetadata.title === 'string' && existingMetadata.title) {
    out.title = existingMetadata.title;
  }
  if (typeof existingMetadata.description === 'string' && existingMetadata.description) {
    out.description = existingMetadata.description;
  }
  if (existingMetadata.textPost != null) out.textPost = existingMetadata.textPost;

  for (const key of PEN_INDEX_KEYS) {
    if (existingMetadata[key] !== undefined && existingMetadata[key] !== null) {
      out[key] = existingMetadata[key];
    }
  }

  return out;
}
