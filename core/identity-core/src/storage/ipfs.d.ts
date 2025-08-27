export interface IPFSConfig {
    url: string;
    gateway: string;
    timeout?: number;
    host?: string;
    port?: number;
    protocol?: string;
    apiKey?: string;
    apiSecret?: string;
}
export interface IPFSMetadata {
    did: string;
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
    version: string;
}
import type { IPFSHTTPClient } from 'ipfs-http-client';
export interface IPFSClient extends IPFSHTTPClient {
}
export declare class IPFSStorage {
    private config;
    private ipfsClient;
    private isDevelopment;
    private mockFiles;
    constructor(config: IPFSConfig);
    private initializeRealIPFS;
    uploadMetadata(metadata: IPFSMetadata): Promise<string>;
    private mockUpload;
    private realUpload;
    downloadMetadata(cid: string): Promise<IPFSMetadata>;
    private mockDownload;
    private realDownload;
    testConnection(): Promise<boolean>;
    getGatewayURL(cid: string): string;
    getMode(): 'development' | 'production';
    getStats(): Promise<{
        mode: string;
        filesCount: number;
        isConnected: boolean;
    }>;
}
export declare function createIPFSStorage(): IPFSStorage;
//# sourceMappingURL=ipfs.d.ts.map