import { SecureMetadataStorage } from '../secureMetadataStorage';

export interface LicenseInfo {
  licenseKey: string;
  type: 'free' | 'perpetual' | 'annual';
  status: 'active' | 'expired' | 'suspended' | 'transferred';
  issuedAt: string;
  expiresAt: string;
  identityHash: string;
  isCommercial: boolean;
  originalIssueDate?: string;
  transferredFrom?: string;
  transferDate?: string;
}

export class LicenseManager {
  private static secureStorage = new SecureMetadataStorage();
  private static readonly LICENSE_PREFIX = 'license_';

  // Check if license is valid (not expired, etc.)
  static isLicenseValid(licenseInfo: LicenseInfo): boolean {
    if (licenseInfo.status !== 'active') return false;
    
    if (licenseInfo.type === 'free' || licenseInfo.type === 'perpetual') return true;
    
    if (licenseInfo.expiresAt === 'Never') return true;
    
    const now = new Date();
    const expiryDate = new Date(licenseInfo.expiresAt);
    return now < expiryDate;
  }

  // Generate receipt for accounting purposes
  static generateReceipt(licenseInfo: LicenseInfo, paymentDetails: any): LicenseInfo {
    return {
      receiptId: `RCP_${Date.now()}_${licenseInfo.identityHash.substring(0, 8)}`,
      licenseType: licenseInfo.type,
      amount: this.getLicensePrice(licenseInfo.type),
      currency: 'USD',
      paymentMethod: paymentDetails.method,
      purchaseDate: licenseInfo.issuedAt,
      identityHash: licenseInfo.identityHash,
      transactionHash: paymentDetails.transactionHash,
      isCommercial: licenseInfo.isCommercial
    };
  }

  // Generate a free non-commercial license for new users
  static async generateFreeLicense(identityHash: string, identityName: string): Promise<LicenseInfo> {
    const licenseKey = `FREE_${identityHash.substring(0, 16)}_${Date.now()}`;
    
    const licenseInfo: LicenseInfo = {
      licenseKey,
      type: 'free',
      identityHash,
      issuedAt: new Date().toISOString(),
      expiresAt: 'Never',
      status: 'active',
      isCommercial: false
    };

    // Store the license
    await this.storeLicense(licenseInfo);
    
    return licenseInfo;
  }

  // Generate a commercial license
  static async generateCommercialLicense(
    licenseType: 'perpetual' | 'annual',
    identityHash: string,
    identityName: string
  ): Promise<LicenseInfo> {
    const licenseKey = `COM_${licenseType.toUpperCase()}_${identityHash.substring(0, 16)}_${Date.now()}`;
    
    const now = new Date();
    const expiresAt = licenseType === 'perpetual' ? 'Never' : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
    
    const licenseInfo: LicenseInfo = {
      licenseKey,
      type: licenseType,
      identityHash,
      issuedAt: now.toISOString(),
      expiresAt,
      status: 'active',
      isCommercial: true
    };

    // Store the license
    await this.storeLicense(licenseInfo);
    
    return licenseInfo;
  }

  // Find license by identity hash
  static async findLicenseByIdentityHash(identityHash: string): Promise<LicenseInfo | null> {
    try {
      const licenseData = await this.secureStorage.getItem(`${this.LICENSE_PREFIX}${identityHash}`);
      if (!licenseData) return null;
      
      const license: LicenseInfo = JSON.parse(licenseData);
      return this.isLicenseValid(license) ? license : null;
    } catch (error) {
      return null;
    }
  }

  // Store license
  static async storeLicense(licenseInfo: LicenseInfo): Promise<void> {
    // Store in secure storage instead of localStorage
    await this.secureStorage.setItem(
      `${this.LICENSE_PREFIX}${licenseInfo.identityHash}`, 
      JSON.stringify(licenseInfo)
    );
  }

  // Transfer license during identity recovery
  static async transferLicense(oldIdentityHash: string, newIdentityHash: string): Promise<LicenseInfo | null> {
    const oldLicense = await this.findLicenseByIdentityHash(oldIdentityHash);
    if (!oldLicense) return null;

    const newLicense: LicenseInfo = {
      ...oldLicense,
      licenseKey: `TRANSFERRED_${oldLicense.licenseKey}`,
      identityHash: newIdentityHash,
      transferredFrom: oldIdentityHash,
      transferDate: new Date().toISOString(),
      originalIssueDate: oldLicense.originalIssueDate || oldLicense.issuedAt
    };

    // Store new license and invalidate old one
    await this.storeLicense(newLicense);
    await this.invalidateLicense(oldLicense.licenseKey);

    return newLicense;
  }

  // Invalidate a license
  static async invalidateLicense(licenseKey: string): Promise<void> {
    // In production, this would update the database
    // For now, we'll search through secure storage
    try {
      // Get all license keys from secure storage
      const allKeys = await this.secureStorage.getAllKeys();
      const licenseKeys = allKeys.filter(key => key.startsWith(this.LICENSE_PREFIX));
      
      for (const key of licenseKeys) {
        const licenseData = await this.secureStorage.getItem(key);
        if (licenseData) {
          const license = JSON.parse(licenseData);
          if (license.licenseKey === licenseKey) {
            license.status = 'expired';
            await this.secureStorage.setItem(key, JSON.stringify(license));
            break;
          }
        }
      }
    } catch (error) {
      // Handle error silently
    }
  }

  // Get license price
  static getLicensePrice(licenseType: string): number {
    switch (licenseType) {
      case 'free': return 0;
      case 'perpetual': return 3999;
      case 'annual': return 1499;
      default: return 0;
    }
  }

  // Check if user has a license (free or commercial)
  static async hasLicense(identityHash: string): Promise<boolean> {
    const license = await this.findLicenseByIdentityHash(identityHash);
    return license !== null && this.isLicenseValid(license);
  }

  // Check if user has commercial license
  static async hasCommercialLicense(identityHash: string): Promise<boolean> {
    const license = await this.findLicenseByIdentityHash(identityHash);
    return license !== null && license.isCommercial && this.isLicenseValid(license);
  }

  // Get license status for display
  static async getLicenseStatus(identityHash: string): Promise<{
    hasLicense: boolean;
    isCommercial: boolean;
    licenseType: string;
    status: string;
    expiresAt: string;
  }> {
    const license = await this.findLicenseByIdentityHash(identityHash);
    
    if (!license) {
      return {
        hasLicense: false,
        isCommercial: false,
        licenseType: 'none',
        status: 'none',
        expiresAt: 'N/A'
      };
    }

    return {
      hasLicense: this.isLicenseValid(license),
      isCommercial: license.isCommercial,
      licenseType: license.type,
      status: license.status,
      expiresAt: license.expiresAt
    };
  }
}
