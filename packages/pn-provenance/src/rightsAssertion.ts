/**
 * The creator's AI training, inference and data-mining preferences as the CAWG training-mining
 * assertion. Separate from `indexingPermissions`, which decides which aggregators may index a post.
 */

export const TRAINING_MINING_LABEL = 'cawg.training-mining';

export type TrainingUse = 'allowed' | 'notAllowed' | 'constrained';

export interface TrainingMiningPreference {
  aiTraining: TrainingUse;
  aiGenerativeTraining: TrainingUse;
  aiInference: TrainingUse;
  dataMining: TrainingUse;
  /** Shown to readers when any use is `constrained`. */
  constraintInfo?: string;
}

/** Nothing is allowed unless the creator says so. */
export const DEFAULT_TRAINING_PREFERENCE: TrainingMiningPreference = {
  aiTraining: 'notAllowed',
  aiGenerativeTraining: 'notAllowed',
  aiInference: 'notAllowed',
  dataMining: 'notAllowed',
};

const ENTRY_KEYS = {
  aiTraining: 'cawg.ai_training',
  aiGenerativeTraining: 'cawg.ai_generative_training',
  aiInference: 'cawg.ai_inference',
  dataMining: 'cawg.data_mining',
} as const;

const USES: readonly TrainingUse[] = ['allowed', 'notAllowed', 'constrained'];

export function trainingMiningAssertion(pref: TrainingMiningPreference = DEFAULT_TRAINING_PREFERENCE): {
  label: typeof TRAINING_MINING_LABEL;
  data: { entries: Record<string, { use: TrainingUse; constraint_info?: string }> };
} {
  const entries: Record<string, { use: TrainingUse; constraint_info?: string }> = {};
  for (const [field, key] of Object.entries(ENTRY_KEYS) as Array<[keyof typeof ENTRY_KEYS, string]>) {
    const use = pref[field];
    entries[key] = use === 'constrained' && pref.constraintInfo ? { use, constraint_info: pref.constraintInfo } : { use };
  }
  return { label: TRAINING_MINING_LABEL, data: { entries } };
}

export function parseTrainingMining(raw: unknown): TrainingMiningPreference | null {
  const entries = (raw as { entries?: Record<string, { use?: unknown; constraint_info?: unknown }> })?.entries;
  if (!entries || typeof entries !== 'object') return null;
  const out = { ...DEFAULT_TRAINING_PREFERENCE };
  let seen = false;
  for (const [field, key] of Object.entries(ENTRY_KEYS) as Array<[keyof typeof ENTRY_KEYS, string]>) {
    const use = entries[key]?.use;
    if (USES.includes(use as TrainingUse)) {
      out[field] = use as TrainingUse;
      seen = true;
      const info = entries[key]?.constraint_info;
      if (typeof info === 'string' && info) out.constraintInfo = info;
    }
  }
  return seen ? out : null;
}
