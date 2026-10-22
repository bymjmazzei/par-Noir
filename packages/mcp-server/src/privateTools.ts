// The MCP SDK's types import zod/v3; plain 'zod' resolves to other declarations in the CommonJS build.
import { z } from 'zod/v3';
import {
  AGENT_CUSTODY_TOOL_SCOPES,
  projectPrivateFileText,
  projectPrivatePenText,
  projectPrivateSearch,
  type PrivateFileText,
  type PrivatePenText,
  type PrivateSearchResult,
} from '@par-noir/standard-data-points';
import { McpToolError } from './errors';
import type { PnPrivateSource } from './source';

const idInput = z.string().trim().min(1).max(200);

const fileHitShape = {
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  modifiedTime: z.string().nullable(),
};

const penHitShape = {
  docId: z.string(),
  title: z.string(),
  updatedAt: z.string().nullable(),
};

const textShape = { text: z.string(), truncated: z.boolean() };

const APPROVAL =
  'Served by par Noir Unlock on the owner’s Mac: the first call in each hour asks the owner to approve with Touch ID.';

/** Local mode only: listed when the token grants the scope and Unlock's socket is present. */
export const PRIVATE_TOOL_DEFS = {
  search_private_files: {
    scopes: AGENT_CUSTODY_TOOL_SCOPES.search_private_files,
    title: 'Search my private files',
    description:
      'Search the owner’s private files and private Pen documents by name or title. Returns names and ids only; ' +
      `use read_private_file or read_private_pen_document for the text. ${APPROVAL}`,
    inputSchema: {
      query: z.string().max(200).default('').describe('Words to match in file names or Pen titles. Empty lists recent items.'),
    },
    outputSchema: {
      files: z.array(z.object(fileHitShape)),
      penDocuments: z.array(z.object(penHitShape)),
    },
  },
  read_private_file: {
    scopes: AGENT_CUSTODY_TOOL_SCOPES.read_private_file,
    title: 'Read a private file',
    description: `Read one private text file by id (text types only, capped at 20,000 characters). ${APPROVAL}`,
    inputSchema: { fileId: idInput.describe('fileId from search_private_files') },
    outputSchema: {
      file: z.object({ fileId: z.string(), name: z.string(), mimeType: z.string(), ...textShape }),
    },
  },
  read_private_pen_document: {
    scopes: AGENT_CUSTODY_TOOL_SCOPES.read_private_pen_document,
    title: 'Read a private Pen document',
    description: `Read one of the owner’s private Pen documents as plain text (capped at 20,000 characters). ${APPROVAL}`,
    inputSchema: { docId: idInput.describe('docId from search_private_files') },
    outputSchema: { document: z.object({ ...penHitShape, ...textShape }) },
  },
} as const;

export type PrivateToolName = keyof typeof PRIVATE_TOOL_DEFS;

export async function searchPrivateFiles(
  source: PnPrivateSource,
  args: { query: string }
): Promise<PrivateSearchResult> {
  return projectPrivateSearch(await source.searchPrivate({ query: args.query }));
}

export async function readPrivateFile(
  source: PnPrivateSource,
  args: { fileId: string }
): Promise<{ file: PrivateFileText }> {
  const file = projectPrivateFileText(await source.readPrivateFile({ fileId: args.fileId }));
  if (!file) throw new McpToolError('unavailable');
  return { file };
}

export async function readPrivatePenDocument(
  source: PnPrivateSource,
  args: { docId: string }
): Promise<{ document: PrivatePenText }> {
  const document = projectPrivatePenText(await source.readPrivatePen({ docId: args.docId }));
  if (!document) throw new McpToolError('unavailable');
  return { document };
}
