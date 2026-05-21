import {
  createPnIntegratorClient,
  PN_INTEGRATOR_SCOPES,
  type PNOAuthSession
} from '@identity-protocol/identity-sdk';

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
  scopes: [...PN_INTEGRATOR_SCOPES, 'zkp:age_attestation'],
  usePopup: true
});

let session: PNOAuthSession | null = null;

function setAuthed(s: PNOAuthSession) {
  session = s;
  for (const id of ['root', 'list', 'upload', 'zkp']) {
    (document.getElementById(id) as HTMLButtonElement).disabled = false;
  }
  log({ did: s.did, expiresAt: s.expiresAt });
}

document.getElementById('login')!.onclick = async () => {
  try {
    const s = await pn.auth.authenticate();
    setAuthed(s);
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};

document.getElementById('root')!.onclick = async () => {
  if (!session) return;
  try {
    log(await pn.storage.getStorageRoot(session.accessToken));
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};

document.getElementById('list')!.onclick = async () => {
  if (!session) return;
  try {
    log(await pn.storage.listFiles(session.accessToken));
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};

document.getElementById('upload')!.onclick = async () => {
  if (!session) return;
  try {
    const name = `starter-${Date.now()}.txt`;
    const body = btoa('Hello from l5-integrator-starter');
    log(
      await pn.storage.uploadFile(session.accessToken, {
        fileName: name,
        fileDataBase64: body,
        mimeType: 'text/plain',
        encrypt: false
      })
    );
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};

document.getElementById('zkp')!.onclick = async () => {
  if (!session) return;
  try {
    log(await pn.zkp.getDataPoints(session.accessToken, { dataPoints: ['age_attestation'] }));
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
  }
};
