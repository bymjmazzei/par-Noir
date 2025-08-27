export interface IPFSConfig {
    apiKey: string;
    apiSecret: string;
    gatewayUrl: string;
    apiUrl: string;
    enabled: boolean;
    pinningEnabled: boolean;
}
export interface IPFSFile {
    cid: string;
    name: string;
    size: number;
    type: string;
    hash: string;
    pinned: boolean;
    uploadedAt: string;
}
export interface IPFSUploadResponse {
    success: boolean;
    cid?: string;
    name?: string;
    size?: number;
    error?: string;
    gatewayUrl?: string;
}
export interface IPFSDownloadResponse {
    success: boolean;
    data?: ArrayBuffer;
    error?: string;
    metadata?: IPFSFile;
}
export interface IPFSPinResponse {
    success: boolean;
    cid?: string;
    pinned?: boolean;
    error?: string;
}
export interface IPFSStats {
    totalFiles: number;
    totalSize: number;
    pinnedFiles: number;
    gatewayRequests: number;
}
export declare class IPFSService {
    private config;
    private isInitialized;
    private files;
    constructor(config: IPFSConfig);
    initialize(): Promise<void>;
    private simulateIPFSConnection;
    uploadFile(file: File | ArrayBuffer, name?: string, pin?: boolean): Promise<IPFSUploadResponse>;
    downloadFile(cid: string): Promise<IPFSDownloadResponse>;
    pinFile(cid: string): Promise<IPFSPinResponse>;
    unpinFile(cid: string): Promise<IPFSPinResponse>;
    getFileMetadata(cid: string): Promise<IPFSFile | null>;
    listFiles(): Promise<IPFSFile[]>;
    deleteFile(cid: string): Promise<boolean>;
    getStats(): Promise<IPFSStats>;
    private validateFile;
    private getFileSize;
    private getFileName;
    private getFileType;
    private generateCID;
    private generateHash;
    private isValidCID;
    private simulateFileUpload;
    private simulateFileDownload;
    private simulateFileDeletion;
    getGatewayUrl(cid: string): string;
    isReady(): boolean;
    getConfig(): IPFSConfig;
    updateConfig(newConfig: Partial<IPFSConfig>): Promise<void>;
}
export declare const ipfsService: IPFSService;
//# sourceMappingURL=ipfsService.d.ts.map