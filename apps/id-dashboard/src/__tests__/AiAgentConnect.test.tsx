import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.parnoir.com/' }));

const fetchAiAgents = jest.fn();
const revokeAllAiAgents = jest.fn();
const fetchAiAgentConnectors = jest.fn();
jest.mock('../services/ownedAssetsApi', () => ({
  fetchAiAgents: (...args: unknown[]) => fetchAiAgents(...args),
  revokeAllAiAgents: (...args: unknown[]) => revokeAllAiAgents(...args),
  fetchAiAgentConnectors: (...args: unknown[]) => fetchAiAgentConnectors(...args),
}));

import { AiAgentConnectCard, AiAgentConnectorList, aiMcpServerUrl } from '../components/subpn/AiAgentConnect';
import { AiAgentsPrivacyRow } from '../components/privacy/AiAgentsPrivacyRow';

const AGENT = {
  id: '11111111-2222-4333-8444-555555555555',
  subjectPnIdentifier: 'pn-agentsubpn1',
  label: 'Claude',
  scopes: ['ai:files.published'],
  createdAt: '2026-10-20T10:00:00.000Z',
};

beforeEach(() => {
  fetchAiAgents.mockReset();
  revokeAllAiAgents.mockReset();
  fetchAiAgentConnectors.mockReset();
});

describe('AiAgentConnectCard', () => {
  it('shows the remote MCP server URL and steps for each supported client', () => {
    render(<AiAgentConnectCard />);
    expect(screen.getByText('https://api.parnoir.com/mcp')).toBeInTheDocument();
    for (const client of ['claude.ai', 'ChatGPT', 'Cursor', 'Claude Desktop']) {
      expect(screen.getByText(client)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/pn-mcp login/).length).toBe(2);
    expect(screen.getByText(/Private reads stay on this Mac/)).toBeInTheDocument();
  });

  it('builds the URL from the API endpoint without a doubled slash', () => {
    expect(aiMcpServerUrl('https://api.example.test//')).toBe('https://api.example.test/mcp');
  });
});

describe('AiAgentConnectorList', () => {
  it('lists each app with its kind and last use', async () => {
    fetchAiAgentConnectors.mockResolvedValue([
      { kind: 'connector', name: 'Claude', lastUsedAt: '2026-10-22T14:00:00.000Z' },
      { kind: 'local', name: 'pn-mcp on your Mac', lastUsedAt: null },
    ]);
    render(<AiAgentConnectorList accessToken="tok" pnIdentifier="pn-rootowner01" agentId={AGENT.id} />);
    const list = await screen.findByRole('list', { name: 'Connected apps' });
    expect(list).toHaveTextContent('Claude (connector)');
    expect(list).toHaveTextContent('Last used');
    expect(list).toHaveTextContent('pn-mcp on your Mac (local)');
    expect(list).toHaveTextContent('Not used yet');
    expect(fetchAiAgentConnectors).toHaveBeenCalledWith('tok', 'pn-rootowner01', AGENT.id);
  });

  it('says so when no app has signed in', async () => {
    fetchAiAgentConnectors.mockResolvedValue([]);
    render(<AiAgentConnectorList accessToken="tok" pnIdentifier="pn-rootowner01" agentId={AGENT.id} />);
    expect(await screen.findByText(/No app has signed in/)).toBeInTheDocument();
  });

  it('does not call the API without a session', () => {
    render(<AiAgentConnectorList accessToken={null} pnIdentifier="pn-rootowner01" agentId={AGENT.id} />);
    expect(fetchAiAgentConnectors).not.toHaveBeenCalled();
  });
});

describe('AiAgentsPrivacyRow', () => {
  it('shows connectors per agent and the connect card, and revoke-all clears them', async () => {
    fetchAiAgents.mockResolvedValueOnce([AGENT]).mockResolvedValueOnce([]);
    fetchAiAgentConnectors.mockResolvedValue([
      { kind: 'connector', name: 'ChatGPT', lastUsedAt: '2026-10-22T14:00:00.000Z' },
    ]);
    revokeAllAiAgents.mockResolvedValue({ revoked: 1, sheetSynced: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AiAgentsPrivacyRow accessToken="tok" pnIdentifier="pn-rootowner01" />);
    fireEvent.click(screen.getByRole('button', { name: /AI agents/ }));

    expect(await screen.findByRole('list', { name: 'Connected apps' })).toHaveTextContent('ChatGPT (connector)');
    expect(screen.getByRole('region', { name: 'Connect an AI app' })).toBeInTheDocument();
    expect(screen.queryByText('pn-agentsubpn1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke all AI agents' }));
    await waitFor(() => expect(screen.getByText('Revoked 1 AI agent.')).toBeInTheDocument());
    expect(revokeAllAiAgents).toHaveBeenCalledWith('tok', 'pn-rootowner01');
    expect(screen.queryByRole('list', { name: 'Connected apps' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Connect an AI app' })).not.toBeInTheDocument();
  });
});
