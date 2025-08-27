import { DID } from '../types';
export interface StorageConfig {
    databaseName: string;
    version: number;
    storeName: string;
}
export declare class IndexedDBStorage {
    private config;
    private db;
    constructor(config?: StorageConfig);
    initialize(): Promise<void>;
    storeDID(did: DID, passcode: string): Promise<void>;
    getDID(didId: string, passcode: string): Promise<DID>;
    getAllDIDs(): Promise<Array<{
        id: string;
        pnName: string;
        createdAt: string;
        status: string;
    }>>;
    updateDID(did: DID, passcode: string): Promise<void>;
    deleteDID(didId: string): Promise<void>;
    hasDID(didId: string): Promise<boolean>;
    getDIDByPNName(pnName: string): Promise<{
        id: string;
        pnName: string;
        createdAt: string;
        status: string;
    } | null>;
    clear(): Promise<void>;
    close(): void;
    private validateDIDStructure;
    private performSecureCleanup;
}
//# sourceMappingURL=indexeddb.d.ts.map