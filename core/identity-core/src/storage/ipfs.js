"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPFSStorage = void 0;
exports.createIPFSStorage = createIPFSStorage;
class IPFSStorage {
    constructor(config) {
        this.ipfsClient = null;
        this.mockFiles = new Map();
        this.config = config;
        this.isDevelopment = process.env.NODE_ENV === 'development' ||
            process.env.IPFS_MODE === 'mock' ||
            !process.env.IPFS_API_KEY;
        if (!this.isDevelopment) {
            this.initializeRealIPFS();
        }
    }
    async initializeRealIPFS() {
        try {
            try {
                const { create } = await Promise.resolve().then(() => __importStar(require('ipfs-http-client')));
                this.ipfsClient = create({
                    url: this.config.url || 'https://ipfs.infura.io:5001',
                    headers: this.config.apiKey ? {
                        'Authorization': `Bearer ${this.config.apiKey}`
                    } : undefined
                });
                if (this.ipfsClient) {
                    await this.ipfsClient.version();
                    console.log('✅ Real IPFS client initialized');
                }
            }
            catch (importError) {
                console.warn('⚠️ ipfs-http-client not available, falling back to mock mode');
                this.isDevelopment = true;
            }
        }
        catch (error) {
            console.warn('⚠️ Failed to initialize real IPFS, falling back to mock mode:', error);
            this.isDevelopment = true;
        }
    }
    async uploadMetadata(metadata) {
        try {
            if (this.isDevelopment || !this.ipfsClient) {
                return this.mockUpload(metadata);
            }
            return await this.realUpload(metadata);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to upload metadata to IPFS: ${errorMessage}`);
        }
    }
    async mockUpload(metadata) {
        const data = JSON.stringify(metadata, null, 2);
        const mockCid = `bafybeig${Buffer.from(data).toString('hex').substring(0, 44)}`;
        this.mockFiles.set(mockCid, metadata);
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockCid;
    }
    async realUpload(metadata) {
        if (!this.ipfsClient) {
            throw new Error('IPFS client not initialized');
        }
        const data = JSON.stringify(metadata, null, 2);
        const result = await this.ipfsClient.add(data);
        const cid = result.cid.toString();
        return cid;
    }
    async downloadMetadata(cid) {
        try {
            if (this.isDevelopment || !this.ipfsClient) {
                return this.mockDownload(cid);
            }
            return await this.realDownload(cid);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to download metadata from IPFS: ${errorMessage}`);
        }
    }
    async mockDownload(cid) {
        const stored = this.mockFiles.get(cid);
        if (stored) {
            return stored;
        }
        const mockMetadata = {
            did: 'mock-did',
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: '1.0.0'
        };
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockMetadata;
    }
    async realDownload(cid) {
        if (!this.ipfsClient) {
            throw new Error('IPFS client not initialized');
        }
        const chunks = [];
        for await (const chunk of this.ipfsClient.cat(cid)) {
            chunks.push(chunk);
        }
        const data = Buffer.concat(chunks).toString();
        const metadata = JSON.parse(data);
        return metadata;
    }
    async testConnection() {
        try {
            if (this.isDevelopment) {
                await new Promise(resolve => setTimeout(resolve, 50));
                console.log('🔧 Mock IPFS connection test: OK');
                return true;
            }
            if (!this.ipfsClient) {
                return false;
            }
            await this.ipfsClient.version();
            console.log('🚀 Real IPFS connection test: OK');
            return true;
        }
        catch (error) {
            console.error('❌ IPFS connection test failed:', error);
            return false;
        }
    }
    getGatewayURL(cid) {
        return `${this.config.gateway}${cid}`;
    }
    getMode() {
        return this.isDevelopment ? 'development' : 'production';
    }
    async getStats() {
        const isConnected = await this.testConnection();
        return {
            mode: this.getMode(),
            filesCount: this.mockFiles.size,
            isConnected
        };
    }
}
exports.IPFSStorage = IPFSStorage;
function createIPFSStorage() {
    const isDevelopment = process.env.NODE_ENV === 'development' ||
        process.env.IPFS_MODE === 'mock' ||
        !process.env.IPFS_API_KEY;
    const config = {
        url: process.env.IPFS_API_URL || 'https://ipfs.infura.io:5001',
        gateway: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/',
        timeout: parseInt(process.env.IPFS_TIMEOUT || '30000'),
        host: process.env.IPFS_HOST || 'ipfs.infura.io',
        port: parseInt(process.env.IPFS_PORT || '5001'),
        protocol: process.env.IPFS_PROTOCOL || 'https',
        apiKey: process.env.IPFS_API_KEY,
        apiSecret: process.env.IPFS_API_SECRET
    };
    return new IPFSStorage(config);
}
//# sourceMappingURL=ipfs.js.map