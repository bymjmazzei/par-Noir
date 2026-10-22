import React, { useEffect, useState } from 'react';
import { Copy, Plug } from 'lucide-react';
import { API_ENDPOINT } from '../../config/api';
import { fetchAiAgentConnectors, type AiAgentConnectorDto } from '../../services/ownedAssetsApi';

export function aiMcpServerUrl(apiEndpoint: string = API_ENDPOINT): string {
  return `${apiEndpoint.replace(/\/+$/, '')}/mcp`;
}

interface ConnectStep {
  client: string;
  steps: string[];
}

const CONNECT_STEPS: ConnectStep[] = [
  {
    client: 'claude.ai',
    steps: [
      'Open Settings, then Connectors, then Add custom connector.',
      'Paste the server URL and choose Connect.',
      'Approve in par Noir Unlock on your Mac and pick this agent.',
    ],
  },
  {
    client: 'ChatGPT',
    steps: [
      'Open Settings, then Apps and Connectors, then Create.',
      'Paste the server URL and choose OAuth.',
      'Approve in par Noir Unlock on your Mac and pick this agent.',
    ],
  },
  {
    client: 'Cursor',
    steps: [
      'In a terminal on this Mac, run pn-mcp login and pick this agent in par Noir Unlock.',
      'In Cursor Settings, MCP, add a server with command pn-mcp and argument serve.',
      'Private files and Pen documents work here only, with Touch ID.',
    ],
  },
  {
    client: 'Claude Desktop',
    steps: [
      'In a terminal on this Mac, run pn-mcp login and pick this agent in par Noir Unlock.',
      'In Settings, Developer, Edit config, add a server with command pn-mcp and argument serve.',
      'Restart Claude Desktop. Private reads ask for Touch ID once an hour.',
    ],
  },
];

/** Where an AI app connects, and how, for each supported client. */
export const AiAgentConnectCard: React.FC = () => {
  const url = aiMcpServerUrl();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-label="Connect an AI app" className="border border-border rounded-lg p-3 space-y-3 text-sm">
      <h5 className="font-medium flex items-center gap-2">
        <Plug className="w-4 h-4" />
        Connect
      </h5>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-xs break-all bg-secondary border border-border rounded px-2 py-1">
          {url}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs hover:bg-border"
        >
          <Copy className="w-3 h-3" />
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        Hosted apps get published files, proofs and drafts only. Private reads stay on this Mac.
      </p>
      {CONNECT_STEPS.map(({ client, steps }) => (
        <details key={client} className="rounded border border-border px-3 py-2">
          <summary className="cursor-pointer font-medium">{client}</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1 text-text-secondary">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
};

interface AiAgentConnectorListProps {
  accessToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  agentId: string;
}

/** Apps signed in as this agent right now. Revoking the agent signs all of them out. */
export const AiAgentConnectorList: React.FC<AiAgentConnectorListProps> = ({ accessToken, pnIdentifier, agentId }) => {
  const [connectors, setConnectors] = useState<AiAgentConnectorDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken || !pnIdentifier) return;
    let cancelled = false;
    setConnectors(null);
    setFailed(false);
    fetchAiAgentConnectors(accessToken, pnIdentifier, agentId)
      .then((list) => {
        if (!cancelled) setConnectors(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, pnIdentifier, agentId]);

  if (failed) return <p className="text-xs text-text-secondary">Could not load connected apps.</p>;
  if (connectors === null) return <p className="text-xs text-text-secondary">Checking connected apps…</p>;
  if (connectors.length === 0) {
    return <p className="text-xs text-text-secondary">No app has signed in as this agent yet.</p>;
  }
  return (
    <ul aria-label="Connected apps" className="space-y-1">
      {connectors.map((c, i) => (
        <li key={`${c.kind}-${c.name}-${i}`} className="text-xs flex flex-wrap justify-between gap-2">
          <span className="text-text-primary">
            {c.name}
            <span className="text-text-secondary">{c.kind === 'local' ? ' (local)' : ' (connector)'}</span>
          </span>
          <span className="text-text-secondary">
            {c.lastUsedAt ? `Last used ${new Date(c.lastUsedAt).toLocaleString()}` : 'Not used yet'}
          </span>
        </li>
      ))}
    </ul>
  );
};
