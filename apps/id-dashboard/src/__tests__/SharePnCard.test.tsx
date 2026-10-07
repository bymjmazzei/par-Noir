import { render, screen } from '@testing-library/react';

jest.mock('@par-noir/social-connections', () => ({
  buildMessagingConnectUrl: (origin: string, pnIdentifier: string) => {
    const base = origin.replace(/\/$/, '');
    const id = pnIdentifier.toLowerCase().startsWith('pn-')
      ? pnIdentifier.toLowerCase()
      : `pn-${pnIdentifier.toLowerCase()}`;
    return `${base}/connect/${id}`;
  }
}));

jest.mock('../services/publicNamesApi', () => ({
  messagingAppOrigin: () => 'https://messaging.parnoir.com'
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc')
}));

import { SharePnCard } from '../components/SharePnCard';

describe('SharePnCard', () => {
  it('shows copy link and copy QR for any pn identifier', async () => {
    render(
      <SharePnCard
        accessToken="token"
        pnIdentifier="pn-abc123def456"
        nickname="Test User"
      />
    );

    expect(await screen.findByText(/connect\/pn-abc123def456/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy qr/i })).toBeInTheDocument();
    expect(screen.queryByText(/public name/i)).not.toBeInTheDocument();
  });

  it('renders nothing without token or pn id', () => {
    const { container } = render(<SharePnCard accessToken={null} pnIdentifier="pn-abc123def456" />);
    expect(container).toBeEmptyDOMElement();
  });
});
