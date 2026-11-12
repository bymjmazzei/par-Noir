/**
 * C2PA manifest definitions Pen signs: originals (created or edited, with the Pen doc and
 * training-mining assertions) and derivatives (resized posters, transcoded renditions) that
 * point at the original as `parentOf`. The pN author assertion references these labels.
 */

import { PEN_DOC_ASSERTION_LABEL, type PenDocAssertionData } from './penDocAssertion.js';
import { TRAINING_MINING_LABEL, trainingMiningAssertion, type TrainingMiningPreference } from './rightsAssertion.js';

export const PEN_CLAIM_GENERATOR = 'par Noir Pen';
export const ACTIONS_LABEL = 'c2pa.actions.v2';

export const DIGITAL_SOURCE = {
  digitalCreation: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation',
  composite: 'http://cv.iptc.org/newscodes/digitalsourcetype/composite',
  compositeCapture: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeCapture',
} as const;

export interface ManifestDefinition {
  claim_generator_info: Array<{ name: string; version: string }>;
  title: string;
  format: string;
  assertions: Array<{ label: string; data: unknown }>;
  ingredients?: Array<{ title: string; format: string; relationship: string }>;
}

/** Labels the author assertion signs over (the hard binding is added by the signer). */
export function authorReferencedLabels(def: ManifestDefinition): string[] {
  return def.assertions.map((a) => a.label);
}

export function penOriginalDefinition(input: {
  title: string;
  format: string;
  version: string;
  penDoc: { label: typeof PEN_DOC_ASSERTION_LABEL; data: PenDocAssertionData };
  training?: TrainingMiningPreference;
  /** `edited` when the file was built from credentialed ingredients. */
  action?: 'c2pa.created' | 'c2pa.edited';
  digitalSourceType?: string;
  ingredients?: Array<{ title: string; format: string; relationship: string }>;
}): ManifestDefinition {
  const action = input.action ?? (input.ingredients?.length ? 'c2pa.edited' : 'c2pa.created');
  const source =
    input.digitalSourceType ?? (input.ingredients?.length ? DIGITAL_SOURCE.composite : DIGITAL_SOURCE.digitalCreation);
  return {
    claim_generator_info: [{ name: PEN_CLAIM_GENERATOR, version: input.version }],
    title: input.title,
    format: input.format,
    assertions: [
      {
        label: ACTIONS_LABEL,
        data: {
          actions: [
            {
              action,
              digitalSourceType: source,
              softwareAgent: { name: PEN_CLAIM_GENERATOR, version: input.version },
            },
          ],
        },
      },
      input.penDoc,
      trainingMiningAssertion(input.training),
    ],
    ...(input.ingredients?.length ? { ingredients: input.ingredients } : {}),
  };
}

/** A rendition of `parent`: same doc and rights, the parent as `parentOf`, and what was done. */
export function derivativeDefinition(input: {
  title: string;
  format: string;
  version: string;
  parent: { title: string; format: string };
  action: 'c2pa.resized' | 'c2pa.transcoded';
  penDoc?: { label: typeof PEN_DOC_ASSERTION_LABEL; data: PenDocAssertionData };
  training?: TrainingMiningPreference;
}): ManifestDefinition {
  return {
    claim_generator_info: [{ name: PEN_CLAIM_GENERATOR, version: input.version }],
    title: input.title,
    format: input.format,
    assertions: [
      {
        label: ACTIONS_LABEL,
        data: {
          actions: [{ action: input.action, softwareAgent: { name: PEN_CLAIM_GENERATOR, version: input.version } }],
        },
      },
      ...(input.penDoc ? [input.penDoc] : []),
      ...(input.training ? [trainingMiningAssertion(input.training)] : []),
    ],
    ingredients: [{ title: input.parent.title, format: input.parent.format, relationship: 'parentOf' }],
  };
}

export { TRAINING_MINING_LABEL };
