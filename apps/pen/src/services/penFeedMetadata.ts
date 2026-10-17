import {
  parsePublishGenre,
  parsePublishTags,
  type PublishMetadataForm,
  type IndexingPermissionsInput
} from '@par-noir/aggregator-domain';

export function metadataFieldsFromPublishForm(form: PublishMetadataForm): Record<string, unknown> {
  const tags = parsePublishTags(form.tags);
  const genre = parsePublishGenre(form.genre);
  return {
    title: form.name.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    keywords: tags.length ? tags : undefined,
    tags: tags.length ? tags : undefined,
    genre: genre.length ? genre : undefined,
    feedCategories: form.categories?.length ? form.categories : undefined,
    category: form.categories?.[0],
    isNSFW: form.isNSFW === true,
    license: form.license || undefined,
    expiresAt: form.expiresAt ?? null,
    ...(form.locationName || form.locationAddress
      ? {
          locationCreated: {
            '@type': 'Place',
            ...(form.locationName ? { name: form.locationName } : {}),
            ...(form.locationAddress
              ? {
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: form.locationAddress.split(',')[0]?.trim() || '',
                    addressRegion: form.locationAddress.split(',')[1]?.trim() || '',
                    addressCountry: form.locationAddress.split(',')[2]?.trim() || ''
                  }
                }
              : {})
          }
        }
      : {})
  };
}

export type FeedPublishExtras = {
  metadata: PublishMetadataForm;
  indexingPermissions?: IndexingPermissionsInput;
};
