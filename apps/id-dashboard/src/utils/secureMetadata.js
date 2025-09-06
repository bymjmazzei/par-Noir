import { IdentityCrypto } from './crypto';
export class SecureMetadataCrypto {
    /**
     * Encrypt metadata using ID file credentials
     */
    static async encryptMetadata(metadata, _username, passcode, identityId) {
        try {
            // Convert metadata to JSON string
            const metadataString = JSON.stringify(metadata);
            // Use the same encryption as ID file
            const encryptedData = await IdentityCrypto.encryptData(metadataString, passcode);
            return {
                encryptedData: encryptedData.encrypted,
                iv: encryptedData.iv,
                salt: encryptedData.salt,
                version: '1.0.0',
                identityId,
                updatedAt: new Date().toISOString()
            };
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                // Failed to encrypt metadata - error handled by caller
            }
            throw new Error('Metadata encryption failed');
        }
    }
    /**
     * Decrypt metadata using ID file credentials
     */
    static async decryptMetadata(secureMetadata, _username, passcode) {
        try {
            // Use the same decryption as ID file
            const encryptedData = {
                encrypted: secureMetadata.encryptedData,
                iv: secureMetadata.iv,
                salt: secureMetadata.salt
            };
            const decryptedString = await IdentityCrypto.decryptData(encryptedData, passcode);
            return JSON.parse(decryptedString);
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                // Failed to decrypt metadata - error handled by caller
            }
            throw new Error('Metadata decryption failed - check your credentials');
        }
    }
    /**
     * Update specific fields in encrypted metadata
     */
    static async updateMetadataField(secureMetadata, _username, passcode, field, value) {
        try {
            // Decrypt current metadata
            const currentMetadata = await this.decryptMetadata(secureMetadata, _username, passcode);
            // Update the specific field
            const updatedMetadata = {
                ...currentMetadata,
                [field]: value
            };
            // Re-encrypt the updated metadata
            return await this.encryptMetadata(updatedMetadata, _username, passcode, secureMetadata.identityId);
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                // Failed to update metadata field - error handled by caller
            }
            throw new Error('Metadata update failed');
        }
    }
    /**
     * Verify metadata integrity
     */
    static async verifyMetadata(secureMetadata, _username, passcode) {
        try {
            await this.decryptMetadata(secureMetadata, _username, passcode);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Create initial metadata for a new identity
     */
    static async createInitialMetadata(_username, passcode, identityId, initialData = {}) {
        const initialMetadata = {
            nickname: initialData.nickname || _username,
            profilePicture: initialData.profilePicture,
            custodians: initialData.custodians || [],
            recoveryKeys: initialData.recoveryKeys || [],
            syncedDevices: initialData.syncedDevices || [],
            privacySettings: initialData.privacySettings || {}
        };
        return await this.encryptMetadata(initialMetadata, _username, passcode, identityId);
    }
}
