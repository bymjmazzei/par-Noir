import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';

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
  it('shows compact share and QR buttons without an expanded link', () => {
    render(<SharePnCard accessToken="token" pnIdentifier="pn-abc123def456" nickname="Test User" />);

    expect(screen.getByRole('button', { name: /share pn link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download qr code/i })).toBeInTheDocument();
    expect(screen.queryByText(/connect\/pn-abc123def456/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('copies the connect link when Web Share is unavailable', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SharePnCard accessToken="token" pnIdentifier="pn-abc123def456" />);

    fireEvent.click(screen.getByRole('button', { name: /share pn link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://messaging.parnoir.com/connect/pn-abc123def456')
    );
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
  });

  it('downloads the QR code as a png named by pn identifier', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('pn-abc123def456-qr.png');
      expect(this.href).toBe('data:image/png;base64,abc');
    });
    render(<SharePnCard accessToken="token" pnIdentifier="pn-abc123def456" />);

    fireEvent.click(screen.getByRole('button', { name: /download qr code/i }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://messaging.parnoir.com/connect/pn-abc123def456',
      expect.objectContaining({ width: 512 })
    );
    click.mockRestore();
  });

  it('renders nothing without token or pn id', () => {
    const { container } = render(<SharePnCard accessToken={null} pnIdentifier="pn-abc123def456" />);
    expect(container).toBeEmptyDOMElement();
  });
});
