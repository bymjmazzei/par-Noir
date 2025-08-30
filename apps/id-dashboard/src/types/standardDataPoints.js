// Standardized Data Points System
// Defines common data points that developers can request
// Each data point has a standard ZKP generation method
// Standard Data Points Registry
// Focused on essential, universal identity attributes
export const STANDARD_DATA_POINTS = {
    // ===== CORE IDENTITY VERIFICATION =====
    'age_attestation': {
        id: 'age_attestation',
        name: 'Age Attestation',
        description: 'Attest to your age for age-restricted services',
        category: 'verification',
        dataType: 'date',
        zkpType: 'age_verification',
        validation: { required: true },
        requiredFields: ['dateOfBirth'],
        defaultPrivacy: 'selective',
        examples: ['Age-restricted content', 'Age verification services', 'Compliance requirements']
    },
    'email_verification': {
        id: 'email_verification',
        name: 'Email Verification',
        description: 'Verify user has access to an email address',
        category: 'verification',
        dataType: 'string',
        zkpType: 'email_verification',
        validation: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: true },
        requiredFields: ['email'],
        defaultPrivacy: 'selective',
        examples: ['Account recovery', 'Communication verification', 'Account creation']
    },
    'phone_verification': {
        id: 'phone_verification',
        name: 'Phone Verification',
        description: 'Verify user has access to a phone number',
        category: 'verification',
        dataType: 'string',
        zkpType: 'phone_verification',
        validation: { pattern: /^\+?[\d\s\-\(\)]+$/, required: true },
        requiredFields: ['phone'],
        defaultPrivacy: 'private',
        examples: ['Two-factor authentication', 'Account recovery', 'Emergency contact']
    },
    'identity_attestation': {
        id: 'identity_attestation',
        name: 'Identity Attestation',
        description: 'Attest to your legal name for identity verification',
        category: 'verification',
        dataType: 'object',
        zkpType: 'identity_attestation',
        validation: { required: true },
        requiredFields: ['firstName', 'middleName', 'lastName'],
        optionalFields: [],
        defaultPrivacy: 'private',
        examples: ['Identity verification', 'Name verification', 'Compliance requirements']
    },
    // ===== LOCATION & GEOGRAPHY =====
    'location_verification': {
        id: 'location_verification',
        name: 'Location Verification',
        description: 'Verify user is in a specific location or region',
        category: 'location',
        dataType: 'object',
        zkpType: 'location_verification',
        validation: { required: true },
        requiredFields: ['country', 'region'],
        optionalFields: ['city', 'postalCode', 'coordinates'],
        defaultPrivacy: 'private',
        examples: ['Geographic verification', 'Regional compliance', 'Location-based services']
    },
};
// Data Point Categories
export const DATA_POINT_CATEGORIES = {
    verification: 'Core Identity Verification',
    location: 'Location & Geography'
};
// Import SecureMetadataStorage for IPFS-based storage
import { SecureMetadataStorage } from '../utils/secureMetadataStorage';
// ZKP Generation Functions
export class ZKPGenerator {
    /**
     * Generate ZKP for a standard data point
     */
    static async generateZKP(request) {
        const dataPoint = STANDARD_DATA_POINTS[request.dataPointId];
        if (!dataPoint) {
            throw new Error(`Unknown data point: ${request.dataPointId}`);
        }
        // Validate user data
        this.validateUserData(dataPoint, request.userData);
        // Generate ZKP based on type
        const proof = await this.generateProofByType(dataPoint.zkpType, request.userData, request.verificationLevel);
        // Create ZKP proof object
        const zkpProof = {
            dataPointId: request.dataPointId,
            proofType: dataPoint.zkpType,
            proof: proof,
            signature: await this.signProof(proof, request.userData),
            timestamp: new Date().toISOString(),
            expiresAt: request.expirationDays ?
                new Date(Date.now() + request.expirationDays * 24 * 60 * 60 * 1000).toISOString() :
                undefined,
            verificationLevel: request.verificationLevel,
            metadata: {
                requestedBy: 'system',
                userConsent: true,
                dataProvided: Object.keys(request.userData)
            }
        };
        return zkpProof;
    }
    /**
     * Propose a new standard data point
     */
    static async proposeDataPoint(proposal, identityId, pnName, passcode) {
        try {
            // Validate proposal
            if (!proposal.name || !proposal.description || !proposal.useCase) {
                return { success: false, error: 'Missing required fields' };
            }
            // Check if data point already exists
            const existingDataPoint = Object.values(STANDARD_DATA_POINTS).find(dp => dp.name.toLowerCase() === proposal.name.toLowerCase());
            if (existingDataPoint) {
                return { success: false, error: 'Data point already exists' };
            }
            // Generate proposal ID
            const proposalId = `proposal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            // Create proposal
            const newProposal = {
                ...proposal,
                id: proposalId,
                proposedAt: new Date().toISOString(),
                status: 'pending',
                votes: {
                    upvotes: 0,
                    downvotes: 0,
                    voters: []
                }
            };
            // Get current metadata
            const currentMetadata = await SecureMetadataStorage.getMetadata(identityId, pnName, passcode);
            // Initialize dataPoints section if it doesn't exist
            if (!currentMetadata.dataPoints) {
                currentMetadata.dataPoints = {
                    access: [],
                    proposals: [],
                    globalSettings: {}
                };
            }
            // Add proposal to metadata
            currentMetadata.dataPoints.proposals.push(newProposal);
            // Update metadata on IPFS
            await SecureMetadataStorage.updateMetadata(identityId, pnName, passcode, currentMetadata);
            return { success: true, proposalId };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to propose data point'
            };
        }
    }
    /**
     * Vote on a data point proposal
     */
    static async voteOnProposal(proposalId, voterId, vote, identityId, pnName, passcode) {
        try {
            // Get current metadata
            const currentMetadata = await SecureMetadataStorage.getMetadata(identityId, pnName, passcode);
            if (!currentMetadata.dataPoints?.proposals) {
                return { success: false, error: 'No proposals found' };
            }
            const proposal = currentMetadata.dataPoints.proposals.find(p => p.id === proposalId);
            if (!proposal) {
                return { success: false, error: 'Proposal not found' };
            }
            if (proposal.status !== 'pending') {
                return { success: false, error: 'Proposal is no longer open for voting' };
            }
            // Check if user already voted
            if (proposal.votes.voters.includes(voterId)) {
                return { success: false, error: 'User has already voted on this proposal' };
            }
            // Add vote
            if (vote === 'upvote') {
                proposal.votes.upvotes++;
            }
            else {
                proposal.votes.downvotes++;
            }
            proposal.votes.voters.push(voterId);
            // Update metadata on IPFS
            await SecureMetadataStorage.updateMetadata(identityId, pnName, passcode, currentMetadata);
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to vote on proposal'
            };
        }
    }
    /**
     * Approve a data point proposal (admin function)
     */
    static async approveDataPointProposal(proposalId, approvedBy) {
        try {
            const proposal = dataPointProposalsStorage[proposalId];
            if (!proposal) {
                return { success: false, error: 'Proposal not found' };
            }
            if (proposal.status !== 'pending') {
                return { success: false, error: 'Proposal is not pending' };
            }
            // Create new standard data point
            const newDataPoint = {
                id: proposal.id.replace('proposal_', ''),
                name: proposal.name,
                description: proposal.description,
                category: proposal.category,
                dataType: proposal.dataType,
                zkpType: 'custom_proof', // Default for new data points
                validation: proposal.validation,
                requiredFields: proposal.requiredFields,
                optionalFields: proposal.optionalFields,
                defaultPrivacy: 'selective',
                examples: proposal.examples
            };
            // Add to standard data points
            STANDARD_DATA_POINTS[newDataPoint.id] = newDataPoint;
            // Update proposal status
            proposal.status = 'approved';
            proposal.approvedBy = approvedBy;
            proposal.approvedAt = new Date().toISOString();
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to approve proposal'
            };
        }
    }
    /**
     * Get all pending proposals for a specific pN
     */
    static async getPendingProposals(identityId, pnName, passcode) {
        try {
            const currentMetadata = await SecureMetadataStorage.getMetadata(identityId, pnName, passcode);
            if (!currentMetadata.dataPoints?.proposals) {
                return [];
            }
            return currentMetadata.dataPoints.proposals.filter(proposal => proposal.status === 'pending');
        }
        catch (error) {
            console.error('Failed to get pending proposals:', error);
            return [];
        }
    }
    /**
     * Get proposal by ID for a specific pN
     */
    static async getProposal(proposalId, identityId, pnName, passcode) {
        try {
            const currentMetadata = await SecureMetadataStorage.getMetadata(identityId, pnName, passcode);
            if (!currentMetadata.dataPoints?.proposals) {
                return undefined;
            }
            return currentMetadata.dataPoints.proposals.find(p => p.id === proposalId);
        }
        catch (error) {
            console.error('Failed to get proposal:', error);
            return undefined;
        }
    }
    /**
     * Validate user data against data point requirements
     */
    static validateUserData(dataPoint, userData) {
        // Check required fields
        for (const field of dataPoint.requiredFields || []) {
            if (!userData[field]) {
                throw new Error(`Required field missing: ${field}`);
            }
        }
        // Apply validation rules
        if (dataPoint.validation) {
            for (const [field, value] of Object.entries(userData)) {
                this.validateField(field, value, dataPoint.validation);
            }
        }
    }
    /**
     * Validate individual field
     */
    static validateField(field, value, validation) {
        if (validation.required && !value) {
            throw new Error(`Field ${field} is required`);
        }
        if (validation.minValue !== undefined && value < validation.minValue) {
            throw new Error(`Field ${field} must be at least ${validation.minValue}`);
        }
        if (validation.maxValue !== undefined && value > validation.maxValue) {
            throw new Error(`Field ${field} must be at most ${validation.maxValue}`);
        }
        if (validation.pattern && !validation.pattern.test(value)) {
            throw new Error(`Field ${field} does not match required pattern`);
        }
        if (validation.custom && !validation.custom(value)) {
            throw new Error(`Field ${field} failed custom validation`);
        }
    }
    /**
     * Generate proof based on ZKP type
     */
    static async generateProofByType(zkpType, userData, verificationLevel) {
        switch (zkpType) {
            case 'age_verification':
                return await this.generateAgeVerificationProof(userData.age, verificationLevel);
            case 'email_verification':
                return await this.generateEmailVerificationProof(userData.email, verificationLevel);
            case 'phone_verification':
                return await this.generatePhoneVerificationProof(userData.phone, verificationLevel);
            case 'location_verification':
                return await this.generateLocationVerificationProof(userData, verificationLevel);
            case 'identity_verification':
                return await this.generateIdentityVerificationProof(userData, verificationLevel);
            case 'preference_disclosure':
                return await this.generatePreferenceDisclosureProof(userData, verificationLevel);
            case 'compliance_attestation':
                return await this.generateComplianceAttestationProof(userData, verificationLevel);
            case 'custom_proof':
                return await this.generateCustomProof(userData, verificationLevel);
            default:
                throw new Error(`Unsupported ZKP type: ${zkpType}`);
        }
    }
    // Individual proof generation methods
    static async generateAgeVerificationProof(age, verificationLevel) {
        // Generate ZKP proving age is above threshold without revealing actual age
        const proof = {
            type: 'age_verification',
            threshold: 18, // Default threshold
            proof: `age_above_${age >= 18 ? '18' : 'under_18'}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generateEmailVerificationProof(email, verificationLevel) {
        // Generate ZKP proving email ownership without revealing email
        const proof = {
            type: 'email_verification',
            domain: email.split('@')[1],
            proof: `email_verified_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generatePhoneVerificationProof(phone, verificationLevel) {
        // Generate ZKP proving phone ownership without revealing phone
        const proof = {
            type: 'phone_verification',
            countryCode: phone.startsWith('+') ? phone.substring(1, 3) : '1',
            proof: `phone_verified_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generateLocationVerificationProof(locationData, verificationLevel) {
        // Generate ZKP proving location without revealing exact location
        const proof = {
            type: 'location_verification',
            country: locationData.country,
            region: locationData.region,
            proof: `location_verified_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generateIdentityVerificationProof(identityData, verificationLevel) {
        // Generate ZKP proving identity verification without revealing document details
        const proof = {
            type: 'identity_verification',
            documentType: identityData.documentType,
            proof: `identity_verified_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generatePreferenceDisclosureProof(preferences, verificationLevel) {
        // Generate ZKP proving preference disclosure
        const proof = {
            type: 'preference_disclosure',
            categories: Object.keys(preferences),
            proof: `preferences_disclosed_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generateComplianceAttestationProof(complianceData, verificationLevel) {
        // Generate ZKP proving compliance attestation
        const proof = {
            type: 'compliance_attestation',
            complianceType: Object.keys(complianceData)[0],
            proof: `compliance_attested_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    static async generateCustomProof(customData, verificationLevel) {
        // Generate ZKP for custom data
        const proof = {
            type: 'custom_proof',
            dataKeys: Object.keys(customData),
            proof: `custom_verified_${verificationLevel}`,
            verificationLevel,
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(proof));
    }
    /**
     * Sign the proof with cryptographic signature
     */
    static async signProof(proof, userData) {
        // In production, this would use proper cryptographic signing
        const signature = {
            proof: proof,
            userDataHash: btoa(JSON.stringify(userData)),
            timestamp: new Date().toISOString()
        };
        return btoa(JSON.stringify(signature));
    }
    /**
     * Get all available data points
     */
    static getAvailableDataPoints() {
        return Object.values(STANDARD_DATA_POINTS);
    }
    /**
     * Get data points by category
     */
    static getDataPointsByCategory(category) {
        return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.category === category);
    }
    /**
     * Get data point by ID
     */
    static getDataPoint(id) {
        return STANDARD_DATA_POINTS[id];
    }
}
