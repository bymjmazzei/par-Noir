import {
  createPnIntegratorClient,
  PN_INTEGRATOR_SCOPES,
  type IntegratorApiContext,
  type PNOAuthSession
} from '@identity-protocol/identity-sdk';
import { getCloudAccessTokenFromSession } from '@par-noir/device-cloud-credentials';
import { mountCloudReconnectHost } from './cloudReconnectMount';

const clientId = import.meta.env.VITE_PN_CLIENT_ID as string;
const apiEndpoint = (import.meta.env.VITE_API_ENDPOINT as string) || 'https://api.parnoir.com';

const out = document.getElementById('out')!;
const log = (msg: unknown) => {
  out.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
};

if (!clientId) {
  log('Set VITE_PN_CLIENT_ID in .env (see .env.example).');
}

const pn = createPnIntegratorClient({
  clientId: clientId || 'missing-client-id',
  redirectUri: `${window.location.origin}/oauth-callback.html`,
  apiEndpoint,
  scopes: [...PN_INTEGRATOR_SCOPES],
  usePopup: true
});

interface StarterSession extends PNOAuthSession {
  pnIdentifier?: string;
}

let session: StarterSession | null = null;

function apiContext(): IntegratorApiContext | string {
  if (!session) return '';
  const cloudAccessToken = session.pnIdentifier
    ? getCloudAccessTokenFromSession(session.pnIdentifier) ?? undefined
    : undefined;
  if (!cloudAccessToken) return session.accessToken;
  return {
    accessToken: session.accessToken,
    cloudAccessToken
  };
}

function setAuthed(s: StarterSession) {
  session = s;
  mountCloudReconnectHost({
    apiEndpoint,
    authToken: s.accessToken,
    pnIdentifier: s.pnIdentifier ?? null
  });
  for (const id of ['publish', 'list']) {
    (document.getElementById(id) as HTMLButtonElement).disabled = false;
  }
  log({ did: s.did, pnIdentifier: s.pnIdentifier, clientId, expiresAt: s.expiresAt });
}

document.getElementById('login')!.onclick = async () => {
  try {
    const s = await pn.auth.authenticate();
    const userInfo = (await pn.auth.getUserInfo(s.accessToken)) as {
      pn_identifier?: string;
    };
    setAuthed({ ...s, pnIdentifier: userInfo.pn_identifier });
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};

document.getElementById('publish')!.onclick = async () => {
  if (!session?.pnIdentifier) return;
  try {
    const ctx = apiContext();
    const fileName = `community-demo-${Date.now()}.txt`;
    const upload = await pn.storage.uploadFile(ctx, {
      fileName,
      fileDataBase64: btoa('Hello from l5-community-starter'),
      mimeType: 'text/plain',
      encrypt: false
    });
    const fileId = upload.file?.id;
    if (!fileId) throw new Error('Upload did not return a file id');

    await pn.publish.submitMetadataIndex(ctx, {
      fileId,
      backend: 'google_drive',
      backendFileId: fileId,
      name: fileName,
      description: 'Demo community post from l5-community-starter',
      isPublic: true,
      uploadDate: new Date().toISOString(),
      pnIdentifier: session.pnIdentifier,
      indexingPermissions: {
        mode: 'custom',
        allowed: [clientId],
        updatedAt: new Date().toISOString()
      }
    });

    log({ published: true, fileId, indexerId: clientId });
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};

document.getElementById('list')!.onclick = async () => {
  if (!session) return;
  try {
    log(await pn.feed.listByIndexerId(apiContext(), { indexerId: clientId, limit: 10 }));
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};
