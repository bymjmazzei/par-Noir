export interface KeyPair {
    publicKey: string;
    privateKey: string;
}

export interface DIDResult {
    publicKey: string;
    privateKey: string;
    did: string;
}

export interface DIDKeyPair {
    publicKey: string;
    privateKey: string;
    did: string;
    mlKemPublicKey: string;
    mlKemSecretKey: string;
}

export interface AuthSession {
    id: string; // DID - public identifier, safe to store
    nickname: string; // Display name - safe to store
    accessToken: string;
    expiresIn: number;
    authenticatedAt: string;
    publicKey: string; // Public key - safe to store
    authToken?: string;
    // SECURITY: pnName and passcode are SECRETS and must NEVER be stored here
    // Use SecureCredentialManager.getCredentials(id) to retrieve them when needed
}

export interface IdentityData {
    id: string;
    username: string;
    nickname: string;
    email: string;
    phone: string;
    recoveryEmail: string;
    recoveryPhone: string;
    profilePicture: string;
    createdAt: string;
    status: string;
    custodiansRequired: boolean;
    custodiansSetup: boolean;
    recoveryKeys: string[];
}

export interface EncryptedData {
    encrypted: string;
    iv: string;
    salt: string;
}

export interface EncryptedIdentity {
    publicKey: string;
    mlKemPublicKey?: string;
    encryptedData: string;
    iv: string;
    salt: string;
}

export interface AuthenticationResult {
    id: string;
    pnName: string;
    nickname: string;
    accessToken: string;
    expiresIn: number;
    authenticatedAt: string;
    publicKey: string;
}

export interface RecoveryKeyData {
    identityId: string;
    purpose: string;
    timestamp: number;
    random: Uint8Array;
}

export interface TokenPayload {
    did: string;
    username: string;
    iat: number;
    exp: number;
}

export interface TokenHeader {
    alg: string;
    typ: string;
}

export interface DecryptionParameters {
    iterations: number;
    hash: string;
}
