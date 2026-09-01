import { createRoot, Root } from 'react-dom/client';
import { ThirdPartyCloudReconnectHost } from '@par-noir/oauth-ui';

export interface CloudReconnectMountOptions {
  apiEndpoint: string;
  authToken: string | null;
  pnIdentifier: string | null;
}

let root: Root | null = null;

export function mountCloudReconnectHost(opts: CloudReconnectMountOptions): void {
  const el = document.getElementById('cloud-reconnect');
  if (!el) return;
  if (!root) root = createRoot(el);
  root.render(
    <ThirdPartyCloudReconnectHost
      apiEndpoint={opts.apiEndpoint}
      authToken={opts.authToken}
      pnIdentifier={opts.pnIdentifier}
    />
  );
}

export function unmountCloudReconnectHost(): void {
  root?.unmount();
  root = null;
}
