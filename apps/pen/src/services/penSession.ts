/** Pen's instance of the shared pN session (refresh, idle lock, lock-all, reload home). */

import { createPnSession, type PnSessionRecord } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

export interface PenSessionKeys {
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
  mlKemSecretKey?: string;
}

export type PenSession = PnSessionRecord<PenSessionKeys>;

export const penSession = createPnSession<PenSessionKeys>({
  clientId: PN_CLIENT_ID,
  apiEndpoint: API_ENDPOINT,
  storageKey: 'pen_session',
});
