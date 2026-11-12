import {
  parsePublishGenre,
  parsePublishTags,
  type PublishMetadataForm,
  type IndexingPermissionsInput
} from '@par-noir/aggregator-domain';
import {
  DEFAULT_TRAINING_PREFERENCE,
  parseTrainingMining,
  trainingMiningAssertion,
  type TrainingMiningPreference
} from '@par-noir/pn-provenance';

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
  /** AI training and data-mining preference carried in the media's Content Credentials. */
  training?: TrainingMiningPreference;
};

const TRAINING_PREF_KEY = 'pen_training_preference';

/** The creator's last choice, used as the default for the next publish. */
export function loadTrainingPreference(): TrainingMiningPreference {
  try {
    const raw = JSON.parse(localStorage.getItem(TRAINING_PREF_KEY) || 'null');
    return parseTrainingMining({ entries: raw?.entries }) ?? DEFAULT_TRAINING_PREFERENCE;
  } catch {
    return DEFAULT_TRAINING_PREFERENCE;
  }
}

export function saveTrainingPreference(pref: TrainingMiningPreference): void {
  try {
    localStorage.setItem(TRAINING_PREF_KEY, JSON.stringify(trainingMiningAssertion(pref).data));
  } catch {
    /* storage unavailable */
  }
}

/** One switch in the publish form: AI training, generative training, inference and mining together. */
export function trainingPreferenceFromAllow(allow: boolean): TrainingMiningPreference {
  const use = allow ? 'allowed' : 'notAllowed';
  return { aiTraining: use, aiGenerativeTraining: use, aiInference: use, dataMining: use };
}

export function trainingAllowed(pref: TrainingMiningPreference): boolean {
  return pref.aiTraining === 'allowed' && pref.aiGenerativeTraining === 'allowed';
}
