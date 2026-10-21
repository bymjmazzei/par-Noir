import { describe, expect, it } from 'vitest';
import {
  AGENT_CUSTODY_TOOL_SCOPES,
  PRIVATE_SEARCH_MAX_RESULTS,
  PRIVATE_TEXT_MAX_CHARS,
  capPrivateText,
  isPrivateTextType,
  parseAgentCustodyRequest,
  parseAgentCustodyResponse,
  projectPrivateFileText,
  projectPrivatePenText,
  projectPrivateSearch,
} from './agentCustody';
import { AI_SCOPES, isLocalOnlyAiScope } from './agentClient';

describe('agent custody contract', () => {
  it('gates every tool on local-only private scopes', () => {
    for (const scopes of Object.values(AGENT_CUSTODY_TOOL_SCOPES)) {
      expect(scopes.length).toBeGreaterThan(0);
      expect(scopes.every(isLocalOnlyAiScope)).toBe(true);
    }
    expect(AGENT_CUSTODY_TOOL_SCOPES.read_private_file).toEqual([AI_SCOPES.filesPrivate]);
    expect(AGENT_CUSTODY_TOOL_SCOPES.read_private_pen_document).toEqual([AI_SCOPES.penPrivate]);
  });

  it('parses well-formed requests and rejects the rest', () => {
    const ok = { v: 1, id: 'r-1', token: 'jwt', tool: 'read_private_file', args: { fileId: 'f' } };
    expect(parseAgentCustodyRequest(ok)).toEqual(ok);
    expect(parseAgentCustodyRequest({ ...ok, args: undefined })?.args).toEqual({});
    expect(parseAgentCustodyRequest({ ...ok, v: 2 })).toBeNull();
    expect(parseAgentCustodyRequest({ ...ok, tool: 'delete_everything' })).toBeNull();
    expect(parseAgentCustodyRequest({ ...ok, id: 'bad id with spaces' })).toBeNull();
    expect(parseAgentCustodyRequest({ ...ok, token: '' })).toBeNull();
    expect(parseAgentCustodyRequest({ ...ok, args: ['x'] })).toBeNull();
  });

  it('parses responses with known error codes only', () => {
    expect(parseAgentCustodyResponse({ v: 1, id: 'r', ok: false, error: 'owner_declined' })).toEqual({
      v: 1,
      id: 'r',
      ok: false,
      error: 'owner_declined',
    });
    expect(parseAgentCustodyResponse({ v: 1, id: 'r', ok: false, error: 'stack trace here' })).toBeNull();
    expect(parseAgentCustodyResponse({ v: 1, id: 'r', ok: true, result: { a: 1 } })?.ok).toBe(true);
  });

  it('projects search hits to allowlisted fields and caps the count', () => {
    const files = Array.from({ length: PRIVATE_SEARCH_MAX_RESULTS + 5 }, (_, i) => ({
      fileId: `f${i}`,
      name: `note ${i}.txt`,
      mimeType: 'text/plain',
      modifiedTime: '2026-01-01T00:00:00Z',
      ownerEmail: 'someone@example.com',
      accessToken: 'ya29.secret',
    }));
    const out = projectPrivateSearch({
      files,
      penDocuments: [{ docId: 'd1', title: 'Plan', updatedAt: 'nope', groupId: 'g', docKey: 'k' }],
      extra: 'dropped',
    });
    expect(out.files).toHaveLength(PRIVATE_SEARCH_MAX_RESULTS);
    expect(Object.keys(out.files[0]!).sort()).toEqual(['fileId', 'mimeType', 'modifiedTime', 'name']);
    expect(out.penDocuments).toEqual([{ docId: 'd1', title: 'Plan', updatedAt: null }]);
    expect(JSON.stringify(out)).not.toMatch(/ya29|example\.com|docKey|extra/);
  });

  it('caps text at the character limit without splitting a surrogate pair', () => {
    const long = 'a'.repeat(PRIVATE_TEXT_MAX_CHARS - 1) + '😀' + 'tail';
    const capped = capPrivateText(long);
    expect(capped.truncated).toBe(true);
    expect(capped.text.length).toBe(PRIVATE_TEXT_MAX_CHARS - 1);
    expect(capPrivateText('short')).toEqual({ text: 'short', truncated: false });

    const file = projectPrivateFileText({ fileId: 'f', name: 'a.txt', mimeType: 'text/plain', text: long, key: 'x' });
    expect(file?.truncated).toBe(true);
    expect(Object.keys(file!).sort()).toEqual(['fileId', 'mimeType', 'name', 'text', 'truncated']);
    const pen = projectPrivatePenText({ docId: 'd', title: 'T', updatedAt: null, text: 'body', docKey: 'k' });
    expect(pen).toEqual({ docId: 'd', title: 'T', updatedAt: null, text: 'body', truncated: false });
    expect(projectPrivatePenText({ docId: 'd', text: 42 })).toBeNull();
  });

  it('decodes text types only', () => {
    expect(isPrivateTextType('text/markdown', 'a.md')).toBe(true);
    expect(isPrivateTextType('application/json; charset=utf-8', 'a')).toBe(true);
    expect(isPrivateTextType('application/octet-stream', 'notes.txt')).toBe(true);
    expect(isPrivateTextType('', 'data.csv')).toBe(true);
    expect(isPrivateTextType('application/pdf', 'a.txt')).toBe(false);
    expect(isPrivateTextType('image/png', 'a.png')).toBe(false);
    expect(isPrivateTextType('application/octet-stream', 'archive.zip')).toBe(false);
  });
});
