// import { cryptoWorkerManager } from '../encryption/cryptoWorkerManager';
export class CertificatePinning {
    private pinnedCertificates: Map<string, string[]>;

    constructor() {
        this.pinnedCertificates = new Map();
    }

    /**
     * Pin a certificate for a specific domain
     */
    pinCertificate(domain: string, fingerprints: string[]): void {
        this.pinnedCertificates.set(domain, fingerprints);
    }

    /**
     * Verify a certificate against pinned fingerprints
     */
    verifyCertificate(domain: string, fingerprint: string): boolean {
        const pinnedFingerprints = this.pinnedCertificates.get(domain);
        if (!pinnedFingerprints) {
            return true; // No pinning for this domain
        }
        return pinnedFingerprints.includes(fingerprint);
    }

    /**
     * Get all pinned certificates
     */
    getPinnedCertificates(): Map<string, string[]> {
        return new Map(this.pinnedCertificates);
    }

    /**
     * Remove certificate pinning for a domain
     */
    unpinCertificate(domain: string): boolean {
        return this.pinnedCertificates.delete(domain);
    }

    /**
     * Check if a domain has certificate pinning
     */
    hasPinning(domain: string): boolean {
        return this.pinnedCertificates.has(domain);
    }

    /**
     * Get pinned fingerprints for a specific domain
     */
    getPinnedFingerprints(domain: string): string[] | undefined {
        return this.pinnedCertificates.get(domain);
    }
}
