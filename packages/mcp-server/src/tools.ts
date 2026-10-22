// The MCP SDK's types import zod/v3; plain 'zod' resolves to other declarations in the CommonJS build.
import { z } from 'zod/v3';
import {
  AI_SCOPES,
  ATTESTABLE_DATA_POINT_IDS,
  isAttestableDataPointId,
  type AgentAttestation,
} from '@par-noir/standard-data-points';
import { McpToolError } from './errors';
import { sealPenAgentDraft } from './penDraft';
import type { PnMcpSource } from './source';

/** Canonical public address of a published file; ChatGPT shows it as the citation. */
export const PUBLIC_RESOURCE_URL_BASE = 'https://parnoir.com/resource/';

const fileSummaryShape = {
  fileId: z.string(),
  title: z.string(),
  description: z.string(),
  fileType: z.string(),
  contentClass: z.string(),
  tags: z.array(z.string()),
  publishedAt: z.string(),
};

const fileSchema = z.object({
  ...fileSummaryShape,
  text: z.string().nullable(),
  textTruncated: z.boolean(),
});

const penDocumentSchema = z.object({
  docId: z.string(),
  fileId: z.string(),
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  text: z.string().nullable(),
  textTruncated: z.boolean(),
});

const dataPointIdSchema = z.enum(ATTESTABLE_DATA_POINT_IDS);

const proofShape = {
  dataPointId: dataPointIdSchema,
  satisfied: z.boolean(),
  level: z.enum(['attested', 'verified']),
  expiresAt: z.string().nullable(),
};

export type FileSummary = z.infer<z.ZodObject<typeof fileSummaryShape>>;
export type AgentFile = z.infer<typeof fileSchema>;
export type PenDocument = z.infer<typeof penDocumentSchema>;

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').slice(0, 50) : [];

/* Allowlist projections: a field reaches the AI tool only if it is named here. */

export function projectFileSummary(raw: unknown): FileSummary {
  const r = record(raw);
  return {
    fileId: str(r.fileId),
    title: str(r.title),
    description: str(r.description),
    fileType: str(r.fileType),
    contentClass: str(r.contentClass),
    tags: strList(r.tags),
    publishedAt: str(r.publishedAt),
  };
}

export function projectFile(raw: unknown): AgentFile {
  const r = record(raw);
  return { ...projectFileSummary(r), text: text(r.text), textTruncated: r.textTruncated === true };
}

export function projectPenDocument(raw: unknown): PenDocument {
  const r = record(raw);
  return {
    docId: str(r.docId),
    fileId: str(r.fileId),
    title: str(r.title),
    description: str(r.description),
    publishedAt: str(r.publishedAt),
    updatedAt: str(r.updatedAt),
    text: text(r.text),
    textTruncated: r.textTruncated === true,
  };
}

/** Yes/no answer only. A reply that is not exactly a proof for the asked id is refused. */
export function projectProof(raw: unknown, asked: string): AgentAttestation {
  const r = record(raw);
  const id = str(r.dataPointId);
  if (id !== asked || !isAttestableDataPointId(id) || typeof r.satisfied !== 'boolean') {
    throw new McpToolError('unavailable');
  }
  if (r.level !== 'attested' && r.level !== 'verified') throw new McpToolError('unavailable');
  const expiresAt = typeof r.expiresAt === 'string' && !Number.isNaN(Date.parse(r.expiresAt)) ? r.expiresAt : null;
  return { dataPointId: id, satisfied: r.satisfied, level: r.level, expiresAt };
}

const idInput = z.string().trim().min(1).max(200);

/** Only the PenAgentBuild fields; anything else the AI adds is dropped before sealing. */
const penAgentBuildSchema = z.object({
  templateId: z.string().min(1).max(200).describe('Pen starter template id, for example note.hot_take.v1'),
  title: z.string().min(1).max(300),
  sections: z
    .array(
      z.object({
        slug: z.string().min(1).max(100).describe('Section slug from the template'),
        plainText: z.string().optional().describe('Section text; blank lines split paragraphs'),
        doc: z.record(z.unknown()).optional().describe('TipTap JSON doc, instead of plainText'),
        html: z.string().optional().describe('Pen library HTML, compiled into layers'),
      })
    )
    .max(50)
    .optional(),
  rows: z
    .array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(500)
    .optional()
    .describe('Register rows, for templates that have register columns'),
});

const draftStatusShape = {
  draftId: z.string(),
  status: z.literal('awaiting_owner'),
};

const searchResultShape = { id: z.string(), title: z.string(), url: z.string() };

const fetchResultShape = {
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.object({
    description: z.string(),
    fileType: z.string(),
    contentClass: z.string(),
    tags: z.array(z.string()),
    publishedAt: z.string(),
    textTruncated: z.boolean(),
  }),
};

export type SearchResult = z.infer<z.ZodObject<typeof searchResultShape>>;
export type FetchResult = z.infer<z.ZodObject<typeof fetchResultShape>>;

export const TOOL_DEFS = {
  search_my_files: {
    scope: AI_SCOPES.filesPublished,
    title: 'Search my published files',
    description:
      "Search files the owner has published publicly on par Noir. Returns titles, descriptions, tags and ids; use read_file for a file's text.",
    inputSchema: {
      query: z.string().max(200).default('').describe('Words to match in title, description or tags. Empty lists recent files.'),
      limit: z.number().int().min(1).max(50).default(20),
    },
    outputSchema: { files: z.array(z.object(fileSummaryShape)) },
  },
  read_file: {
    scope: AI_SCOPES.filesPublished,
    title: 'Read a published file',
    description: 'Read one published file by id: its details and text (text posts only, capped at 20,000 characters).',
    inputSchema: { fileId: idInput.describe('fileId from search_my_files') },
    outputSchema: { file: fileSchema },
  },
  read_pen_document: {
    scope: AI_SCOPES.penPublished,
    title: 'Read a published Pen document',
    description: 'Read one Pen document the owner has published, by its Pen document id.',
    inputSchema: { docId: idInput.describe('Pen document id') },
    outputSchema: { document: penDocumentSchema },
  },
  prove_data_point: {
    scope: AI_SCOPES.proofs,
    title: 'Check a proof the owner holds',
    description:
      'Ask yes or no about one proof the owner chose to share with this agent, such as over_18 or email_verification. ' +
      'Returns only whether it is satisfied, its level (attested or verified) and when it expires; never the underlying data.',
    inputSchema: { dataPointId: dataPointIdSchema.describe('Which proof to check') },
    outputSchema: proofShape,
  },
  propose_pen_draft: {
    scope: AI_SCOPES.penDrafts,
    title: 'Propose a Pen draft',
    description:
      'Propose a new Pen document for the owner. It is sealed to the owner before it leaves this tool and waits in ' +
      'Pen under AI drafts; nothing is saved until they accept it, and unaccepted drafts expire after 7 days. ' +
      'Retrying with the same draftId does not create a second draft.',
    inputSchema: {
      draftId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/)
        .describe('A new unique id you choose for this draft, such as a UUID. Reuse it only when retrying.'),
      build: penAgentBuildSchema,
    },
    outputSchema: draftStatusShape,
  },
  search: {
    scope: AI_SCOPES.filesPublished,
    title: 'Search published files',
    description:
      'Search files the owner has published publicly on par Noir. Returns ids, titles and public URLs; use fetch for the text.',
    inputSchema: { query: z.string().max(200).describe('Words to match in title, description or tags') },
    outputSchema: { results: z.array(z.object(searchResultShape)) },
  },
  fetch: {
    scope: AI_SCOPES.filesPublished,
    title: 'Fetch a published file',
    description: 'Fetch one published file by id from search: its text (text posts only, capped at 20,000 characters) and details.',
    inputSchema: { id: idInput.describe('id from search') },
    outputSchema: fetchResultShape,
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFS;

const SEARCH_ALIAS_LIMIT = 20;

export async function searchMyFiles(
  source: PnMcpSource,
  args: { query: string; limit: number }
): Promise<{ files: FileSummary[] }> {
  const files = await source.searchFiles({ query: args.query, limit: args.limit });
  return { files: (Array.isArray(files) ? files : []).slice(0, args.limit).map(projectFileSummary) };
}

export async function readFile(source: PnMcpSource, args: { fileId: string }): Promise<{ file: AgentFile }> {
  return { file: projectFile(await source.readFile(args.fileId)) };
}

export async function readPenDocument(source: PnMcpSource, args: { docId: string }): Promise<{ document: PenDocument }> {
  return { document: projectPenDocument(await source.readPen(args.docId)) };
}

export async function proveDataPoint(source: PnMcpSource, args: { dataPointId: string }): Promise<AgentAttestation> {
  return projectProof(await source.prove(args.dataPointId), args.dataPointId);
}

/** Seals here, before the source carries anything, so no transport ever holds the plaintext build. */
export async function proposePenDraft(
  source: PnMcpSource,
  args: { draftId: string; build: z.infer<typeof penAgentBuildSchema> }
): Promise<{ draftId: string; status: 'awaiting_owner' }> {
  const submission = await sealPenAgentDraft({
    draftId: args.draftId,
    build: args.build,
    ownerMlKemPublicKey: () => source.ownerMlKemPublicKey(),
  });
  const body = record(await source.proposeDraft(submission));
  if (body.draftId !== args.draftId || body.status !== 'awaiting_owner') throw new McpToolError('unavailable');
  return { draftId: args.draftId, status: 'awaiting_owner' };
}

const resourceUrl = (fileId: string) => `${PUBLIC_RESOURCE_URL_BASE}${encodeURIComponent(fileId)}`;

/** ChatGPT's `search` shape over the same published files as search_my_files. */
export async function searchAlias(source: PnMcpSource, args: { query: string }): Promise<{ results: SearchResult[] }> {
  const { files } = await searchMyFiles(source, { query: args.query, limit: SEARCH_ALIAS_LIMIT });
  return {
    results: files.filter((f) => f.fileId).map((f) => ({ id: f.fileId, title: f.title, url: resourceUrl(f.fileId) })),
  };
}

/** ChatGPT's `fetch` shape over the same published file as read_file. */
export async function fetchAlias(source: PnMcpSource, args: { id: string }): Promise<FetchResult> {
  const { file } = await readFile(source, { fileId: args.id });
  if (!file.fileId) throw new McpToolError('not_found');
  return {
    id: file.fileId,
    title: file.title,
    text: file.text ?? '',
    url: resourceUrl(file.fileId),
    metadata: {
      description: file.description,
      fileType: file.fileType,
      contentClass: file.contentClass,
      tags: file.tags,
      publishedAt: file.publishedAt,
      textTruncated: file.textTruncated,
    },
  };
}
