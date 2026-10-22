import type { AgentApiClient } from './apiClient';
import type { AgentCustodyClient } from './custodyClient';
import { McpToolError } from './errors';
import type { PnMcpSource } from './source';

/** The local CLI's source: the par Noir API over HTTPS, and par Noir Unlock's socket when given. */
export function createApiSource(client: AgentApiClient, custody?: AgentCustodyClient): PnMcpSource {
  return {
    grantedScopes: () => client.grantedScopes(),
    requireAnyScope: (scopes) => client.requireAnyScope(scopes),
    async searchFiles({ query, limit }) {
      const q = new URLSearchParams({ q: query, limit: String(limit) });
      const body = await client.get('files.search', `/api/agent/files/search?${q.toString()}`);
      return Array.isArray(body.files) ? body.files : [];
    },
    async readFile(fileId) {
      return (await client.get('files.read', `/api/agent/files/${encodeURIComponent(fileId)}`)).file;
    },
    async readPen(docId) {
      return (await client.get('pen.read', `/api/agent/pen/${encodeURIComponent(docId)}`)).document;
    },
    prove: (dataPointId) => client.get('proofs.get', `/api/agent/proofs/${encodeURIComponent(dataPointId)}`),
    async ownerMlKemPublicKey() {
      const body = await client.get('agent.owner_key', '/api/agent/owner-key');
      if (typeof body.mlKemPublicKey !== 'string' || !body.mlKemPublicKey) throw new McpToolError('unavailable');
      return body.mlKemPublicKey;
    },
    proposeDraft: (submission) => client.post('pen.drafts', '/api/agent/pen/drafts', submission),
    private: custody && {
      available: () => custody.available(),
      searchPrivate: (args) => custody.call('search_private_files', args),
      readPrivateFile: (args) => custody.call('read_private_file', args),
      readPrivatePen: (args) => custody.call('read_private_pen_document', args),
    },
  };
}
