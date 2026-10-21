import { z } from 'zod';
import {
  AI_SCOPES,
  ATTESTABLE_DATA_POINT_IDS,
  isAttestableDataPointId,
  type AgentAttestation,
} from '@par-noir/standard-data-points';
import type { AgentApiClient } from './apiClient';
import { McpToolError } from './errors';

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
} as const;

export type ToolName = keyof typeof TOOL_DEFS;

export async function searchMyFiles(
  client: AgentApiClient,
  args: { query: string; limit: number }
): Promise<{ files: FileSummary[] }> {
  const q = new URLSearchParams({ q: args.query, limit: String(args.limit) });
  const body = await client.get('files.search', `/api/agent/files/search?${q.toString()}`);
  const files = Array.isArray(body.files) ? body.files : [];
  return { files: files.slice(0, args.limit).map(projectFileSummary) };
}

export async function readFile(client: AgentApiClient, args: { fileId: string }): Promise<{ file: AgentFile }> {
  const body = await client.get('files.read', `/api/agent/files/${encodeURIComponent(args.fileId)}`);
  return { file: projectFile(body.file) };
}

export async function readPenDocument(
  client: AgentApiClient,
  args: { docId: string }
): Promise<{ document: PenDocument }> {
  const body = await client.get('pen.read', `/api/agent/pen/${encodeURIComponent(args.docId)}`);
  return { document: projectPenDocument(body.document) };
}

export async function proveDataPoint(
  client: AgentApiClient,
  args: { dataPointId: string }
): Promise<AgentAttestation> {
  const body = await client.get('proofs.get', `/api/agent/proofs/${encodeURIComponent(args.dataPointId)}`);
  return projectProof(body, args.dataPointId);
}
