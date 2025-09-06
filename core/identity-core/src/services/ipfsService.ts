/**
 * IPFS Service Integration
 * 
 * This file is now a simple re-export wrapper for the new modular IPFS service system.
 * All functionality has been broken down into specialized modules:
 *
 * - ipfsService/types/ipfsService.ts: Interfaces and types for IPFS service
 * - ipfsService/modules/fileManager.ts: File upload, download, and management
 * - ipfsService/modules/connectionManager.ts: IPFS connection management
 * - ipfsService/modules/ipfsService.ts: Main IPFS service orchestrator
 * - ipfsService/index.ts: Re-exports all modular components
 */

// Re-export the main IPFS service and all modular components
export { IPFSService } from './ipfsService/modules/ipfsService';

// Re-export types for backward compatibility
export * from './ipfsService/types/ipfsService';

// Re-export individual modules for direct access if needed
export { FileManager } from './ipfsService/modules/fileManager';
export { ConnectionManager } from './ipfsService/modules/connectionManager';

// Default export for backward compatibility
export { IPFSService as default } from './ipfsService/modules/ipfsService';

// Export singleton instance - commented out for compilation
// export const ipfsService = new IPFSService({
//   apiKey: process.env.IPFS_API_KEY || '',
//   apiSecret: process.env.IPFS_API_SECRET || '',
//   gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io',
//   apiUrl: process.env.IPFS_API_URL || 'https://api.ipfs.io',
//   enabled: process.env.IPFS_ENABLED === 'true',
//   pinningEnabled: process.env.IPFS_PINNING_ENABLED === 'true'
// });
