/**
 * One normalized view of a validated C2PA manifest store (the c2pa reader's JSON), whoever
 * generated it: signer and trust, claim generator, the credited creator (pN author or CAWG /
 * CreativeWork identity, display only), ingredients, training-mining preferences and license.
 */

import { PN_AUTHOR_SIG_TYPE, verifyAuthorAssertion } from './authorAssertion.js';
import { PEN_DOC_ASSERTION_LABEL, parsePenDocAssertion } from './penDocAssertion.js';
import { parseTrainingMining, TRAINING_MINING_LABEL, type TrainingMiningPreference } from './rightsAssertion.js';

export type TrustStatus = 'trusted' | 'untrusted' | 'invalid';

export type ManifestCreator =
  | { kind: 'pn'; handle: string | null; authorKeyId: string }
  | { kind: 'cawg'; display: string };

export interface SummaryIngredient {
  title: string;
  format: string;
  relationship: 'componentOf' | 'parentOf' | 'inputTo';
  manifestLabel: string | null;
  trust: TrustStatus | 'none';
  signer: string | null;
  creator: ManifestCreator | null;
  workLicense: string | null;
}

export interface ManifestSummary {
  v: 1;
  label: string;
  trust: TrustStatus;
  signer: { commonName: string | null; issuer: string | null; alg: string | null; time: string | null };
  claimGenerator: { name: string; version: string | null } | null;
  pnAuthor: { handle: string | null; authorKeyId: string; chainHead: string | null } | null;
  /** First credited creator: the pN author, else a CAWG or CreativeWork identity. */
  creator: ManifestCreator | null;
  ingredients: SummaryIngredient[];
  trainingMining: TrainingMiningPreference | null;
  workLicense: string | null;
  penDoc: { docId: string; templateId: string } | null;
  /** Validation failures that decided the trust status, plus `pn_author.*` problems. */
  failures: string[];
}

type Json = Record<string, any>;

const UNTRUSTED_CODES = new Set(['signingCredential.untrusted', 'timeStamp.untrusted']);
const MAX_DEPTH = 4;

const CC_LICENSES: Array<[RegExp, string]> = [
  [/creativecommons\.org\/publicdomain\/zero\//i, 'cc0'],
  [/creativecommons\.org\/publicdomain\/mark\//i, 'public-domain'],
  [/creativecommons\.org\/licenses\/by-nc-nd\//i, 'cc-by-nc-nd'],
  [/creativecommons\.org\/licenses\/by-nc-sa\//i, 'cc-by-nc-sa'],
  [/creativecommons\.org\/licenses\/by-nc\//i, 'cc-by-nc'],
  [/creativecommons\.org\/licenses\/by-nd\//i, 'cc-by-nd'],
  [/creativecommons\.org\/licenses\/by-sa\//i, 'cc-by-sa'],
  [/creativecommons\.org\/licenses\/by\//i, 'cc-by'],
];

export function licenseFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  for (const [re, id] of CC_LICENSES) if (re.test(url)) return id;
  return null;
}

function codes(list: unknown): Array<{ code: string; url: string }> {
  return Array.isArray(list)
    ? list
        .filter((x) => x && typeof x.code === 'string')
        .map((x) => ({ code: String(x.code), url: typeof x.url === 'string' ? x.url : '' }))
    : [];
}

function trustOf(results: Json | undefined, legacy: unknown): { trust: TrustStatus; failures: string[] } {
  const failure = [...codes(results?.failure), ...codes(legacy).filter((c) => !c.code.endsWith('.trusted'))];
  const decisive = failure.map((c) => c.code).filter((c) => !c.startsWith('cawg.'));
  if (decisive.some((c) => !UNTRUSTED_CODES.has(c))) return { trust: 'invalid', failures: decisive };
  if (decisive.length) return { trust: 'untrusted', failures: decisive };
  const trusted =
    codes(results?.success).some((c) => c.code === 'signingCredential.trusted') ||
    codes(legacy).some((c) => c.code === 'signingCredential.trusted');
  return { trust: trusted ? 'trusted' : 'untrusted', failures: [] };
}

function codePrefix(code: string): string {
  return code.slice(0, code.lastIndexOf('.'));
}

/**
 * An ingredient's results as its builder recorded them, updated by the reader's re-validation
 * (`ingredientDeltas`): the builder may not have had the reader's trust anchors.
 */
function withDelta(stored: Json | undefined, delta: Json | undefined): Json | undefined {
  if (!delta) return stored;
  const fresh = [...codes(delta.success), ...codes(delta.failure)];
  const revalidated = new Set(fresh.map((c) => codePrefix(c.code)));
  const keep = (list: unknown) => codes(list).filter((c) => !revalidated.has(codePrefix(c.code)));
  return {
    success: [...keep(stored?.success), ...codes(delta.success)],
    failure: [...keep(stored?.failure), ...codes(delta.failure)],
  };
}

function assertionsOf(m: Json): Json[] {
  return Array.isArray(m?.assertions) ? m.assertions : [];
}

function find(m: Json, label: string): Json | undefined {
  return assertionsOf(m).find((a) => a?.label === label || String(a?.label).startsWith(`${label}.`));
}

function cawgDisplay(a: Json): string | null {
  const d = a?.data ?? {};
  const ids = d.verifiedIdentities ?? d.credential_subject?.verifiedIdentities ?? d.verified_identities;
  if (Array.isArray(ids) && ids.length) {
    const first = ids[0] ?? {};
    const name = first.username ?? first.name ?? first.uri;
    const provider = first.provider?.name;
    if (typeof name === 'string' && name) return provider ? `${name} (${provider})` : name;
  }
  return null;
}

function creativeWorkAuthor(m: Json): string | null {
  const cw = find(m, 'stds.schema-org.CreativeWork')?.data;
  const author = Array.isArray(cw?.author) ? cw.author[0] : cw?.author;
  const name = author?.name ?? author?.identifier;
  return typeof name === 'string' && name ? name : null;
}

type Ctx = {
  store: Json;
  deltas: Map<string, Json>;
  registryPublicKey: string | null;
  onAuthor?: (author: { authorKeyId: string; publicKey: string }) => void;
};

function summarize(ctx: Ctx, label: string, results: Json | undefined, legacy: unknown, depth: number): ManifestSummary | null {
  const { store, registryPublicKey } = ctx;
  const m = store?.manifests?.[label];
  if (!m) return null;
  const { trust, failures } = trustOf(results, legacy);
  const sig = m.signature_info ?? {};
  const signer = {
    commonName: typeof sig.common_name === 'string' ? sig.common_name : null,
    issuer: typeof sig.issuer === 'string' ? sig.issuer : null,
    alg: typeof sig.alg === 'string' ? sig.alg : null,
    time: typeof sig.time === 'string' ? sig.time : null,
  };
  const gen = Array.isArray(m.claim_generator_info) ? m.claim_generator_info[0] : null;
  const claimGenerator = gen?.name
    ? { name: String(gen.name), version: gen.version ? String(gen.version) : null }
    : typeof m.claim_generator === 'string'
      ? { name: m.claim_generator, version: null }
      : null;

  let pnAuthor: ManifestSummary['pnAuthor'] = null;
  let cawg: string | null = null;
  for (const a of assertionsOf(m)) {
    if (!String(a?.label).startsWith('cawg.identity')) continue;
    const payload = a.data?.signer_payload;
    if (payload?.sig_type === PN_AUTHOR_SIG_TYPE) {
      if (pnAuthor) continue;
      const v = verifyAuthorAssertion({
        signerPayload: payload,
        credential: a.data?.signature,
        registryPublicKey,
        at: signer.time ?? undefined,
      });
      if (v.ok) {
        pnAuthor = { handle: v.handle, authorKeyId: v.authorKeyId, chainHead: v.chainHead };
        ctx.onAuthor?.({ authorKeyId: v.authorKeyId, publicKey: v.publicKey });
      } else failures.push(`pn_author.${v.error}`);
    } else if (!cawg) {
      cawg = cawgDisplay(a);
    }
  }
  const display = cawg ?? creativeWorkAuthor(m);
  const creator: ManifestCreator | null = pnAuthor
    ? { kind: 'pn', handle: pnAuthor.handle, authorKeyId: pnAuthor.authorKeyId }
    : display
      ? { kind: 'cawg', display }
      : null;

  const penDocRaw = parsePenDocAssertion(find(m, PEN_DOC_ASSERTION_LABEL)?.data);
  const cwLicense = licenseFromUrl(find(m, 'stds.schema-org.CreativeWork')?.data?.license);
  const workLicense = penDocRaw?.license.workLicense ?? cwLicense;

  const ingredients: SummaryIngredient[] = [];
  let parent: ManifestSummary | null = null;
  for (const ing of Array.isArray(m.ingredients) ? m.ingredients : []) {
    const childLabel = typeof ing?.active_manifest === 'string' ? ing.active_manifest : null;
    const delta = ctx.deltas.get(`self#jumbf=/c2pa/${label}/c2pa.assertions/${ing?.label}`);
    const child =
      childLabel && depth < MAX_DEPTH
        ? summarize(ctx, childLabel, withDelta(ing.validation_results?.activeManifest, delta), ing.validation_status, depth + 1)
        : null;
    const rel = ing?.relationship;
    if (rel === 'parentOf' && child && !parent) parent = child;
    ingredients.push({
      title: String(ing?.title ?? ''),
      format: String(ing?.format ?? ''),
      relationship: rel === 'parentOf' || rel === 'inputTo' ? rel : 'componentOf',
      manifestLabel: childLabel,
      trust: child ? child.trust : 'none',
      signer: child?.signer.commonName ?? null,
      creator: child?.creator ?? null,
      workLicense: child?.workLicense ?? null,
    });
  }

  const trainingMining = parseTrainingMining(find(m, TRAINING_MINING_LABEL)?.data);
  // A rendition that credits no one carries its parent's credit, at no more trust than the parent.
  const inherit = !creator && parent?.creator ? parent : null;

  return {
    v: 1,
    label,
    trust: inherit ? worseTrust(trust, inherit.trust) : trust,
    signer,
    claimGenerator,
    pnAuthor: inherit ? inherit.pnAuthor : pnAuthor,
    creator: inherit ? inherit.creator : creator,
    ingredients,
    trainingMining: trainingMining ?? inherit?.trainingMining ?? null,
    workLicense: workLicense ?? inherit?.workLicense ?? null,
    penDoc: penDocRaw ? { docId: penDocRaw.docId, templateId: penDocRaw.templateId } : (inherit?.penDoc ?? null),
    failures,
  };
}

const TRUST_RANK: Record<TrustStatus, number> = { trusted: 2, untrusted: 1, invalid: 0 };

function worseTrust(a: TrustStatus, b: TrustStatus): TrustStatus {
  return TRUST_RANK[a] <= TRUST_RANK[b] ? a : b;
}

/**
 * Summary of the active manifest, or null when the file carries no manifest.
 * `onAuthor` sees each verified pN author key; the summary itself keeps only key ids.
 */
export function summarizeManifestStore(
  store: unknown,
  opts: { registryPublicKey: string | null; onAuthor?: Ctx['onAuthor'] }
): ManifestSummary | null {
  const s = store as Json;
  const label = s?.active_manifest;
  if (typeof label !== 'string') return null;
  const deltas = new Map<string, Json>();
  for (const d of Array.isArray(s.validation_results?.ingredientDeltas) ? s.validation_results.ingredientDeltas : []) {
    if (typeof d?.ingredientAssertionURI === 'string' && d.validationDeltas) deltas.set(d.ingredientAssertionURI, d.validationDeltas);
  }
  return summarize(
    { store: s, deltas, registryPublicKey: opts.registryPublicKey, onAuthor: opts.onAuthor },
    label,
    s.validation_results?.activeManifest,
    s.validation_status,
    0
  );
}

/** Display line for the signer: "Made in Pen", "Made with Photoshop", or the certificate name. */
export function signerDisplay(summary: Pick<ManifestSummary, 'claimGenerator' | 'signer'>): string {
  const gen = summary.claimGenerator?.name ?? '';
  if (/par noir pen/i.test(gen)) return 'Made in Pen';
  if (gen) return `Made with ${gen.replace(/\s*\/.*$/, '').replace(/_/g, ' ')}`;
  return summary.signer.commonName ? `Signed by ${summary.signer.commonName}` : 'Content Credentials';
}
