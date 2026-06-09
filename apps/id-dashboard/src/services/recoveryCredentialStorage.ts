export interface StoredCustodianshipCredential {
  custodianId: string;
  identityPublicKey: string;
  identityName: string;
  identityUsername: string;
  shareIndex: number;
  custodianshipZkp: string;
  custodianPasscode: string;
  acceptedAt: string;
}

const CREDENTIALS_KEY = 'pn_recovery_custodianship_credentials';

export function storeCustodianshipCredential(cred: StoredCustodianshipCredential): void {
  const list = listCustodianshipCredentials().filter(
    (c) => !(c.custodianId === cred.custodianId && c.identityPublicKey === cred.identityPublicKey)
  );
  list.push(cred);
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(list));
}

export function listCustodianshipCredentials(): StoredCustodianshipCredential[] {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    return raw ? (JSON.parse(raw) as StoredCustodianshipCredential[]) : [];
  } catch {
    return [];
  }
}

export function getCustodianshipCredential(
  identityPublicKey: string,
  custodianId: string
): StoredCustodianshipCredential | null {
  return (
    listCustodianshipCredentials().find(
      (c) => c.identityPublicKey === identityPublicKey && c.custodianId === custodianId
    ) ?? null
  );
}
