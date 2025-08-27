"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivacyManager = void 0;
const types_1 = require("../types");
const crypto_1 = require("../encryption/crypto");
const SENSITIVE_PATTERNS = [
    'password', 'privateKey', 'recoveryKey', 'ssn', 'medical', 'biometric', 'secret', 'token', 'credential'
];
const ALLOWED_DATA_POINTS = [
    'userProfile', 'displayName', 'avatar', 'preferences', 'theme', 'language', 'content', 'files', 'messages'
];
function isDataPointAllowed(dataPoint) {
    const lower = dataPoint.toLowerCase();
    if (SENSITIVE_PATTERNS.some(pattern => lower.includes(pattern)))
        return false;
    if (!ALLOWED_DATA_POINTS.includes(dataPoint))
        return false;
    return true;
}
class PrivacyManager {
    constructor() {
        this.auditLog = [];
        this.defaultPrivacySettings = {
            shareDisplayName: true,
            shareEmail: false,
            sharePreferences: true,
            shareCustomFields: false,
            allowToolAccess: true,
            requireExplicitConsent: true,
            auditLogging: true
        };
    }
    async processToolAccessRequest(did, request) {
        try {
            this.validateToolRequest(request);
            if (this.detectSuspiciousToolId(request.toolId)) {
                this.logAuditEntry({
                    timestamp: new Date().toISOString(),
                    toolId: request.toolId,
                    action: 'TOOL_REQUEST_BLOCKED',
                    dataRequested: request.requestedData,
                    dataShared: [],
                    userConsent: false
                });
                return this.createDeniedResponse(request, 'Tool request blocked due to security concerns');
            }
            const validationResult = this.validateDataPointRequests(request.requestedData);
            if (!validationResult.isValid) {
                this.logAuditEntry({
                    timestamp: new Date().toISOString(),
                    toolId: request.toolId,
                    action: 'DATA_POINT_REQUEST_BLOCKED',
                    dataRequested: request.requestedData,
                    dataShared: [],
                    userConsent: false
                });
                return this.createDeniedResponse(request, `Data point request blocked: ${validationResult.reason}`);
            }
            const privacySettings = this.getPrivacySettings(did);
            const blockedDataPoints = request.requestedData.filter(dataPoint => {
                const globalSetting = privacySettings.dataPoints[dataPoint]?.globalSetting;
                return globalSetting === false;
            });
            if (blockedDataPoints.length > 0) {
                this.logAuditEntry({
                    timestamp: new Date().toISOString(),
                    toolId: request.toolId,
                    action: 'GLOBAL_PRIVACY_BLOCK',
                    dataRequested: blockedDataPoints,
                    dataShared: [],
                    userConsent: false
                });
                return this.createDeniedResponse(request, `Access denied: ${blockedDataPoints.join(', ')} are globally blocked`);
            }
            this.registerDataPoints(did, request.requestedData, request.toolId);
            const allowedDataPoints = request.requestedData.filter(dataPoint => {
                const globalSetting = privacySettings.dataPoints[dataPoint]?.globalSetting;
                return globalSetting !== false;
            });
            if (allowedDataPoints.length === 0) {
                return this.createDeniedResponse(request, 'No data points allowed based on privacy settings');
            }
            if (!privacySettings.dataPoints) {
                privacySettings.dataPoints = {};
            }
            for (const dataPoint of allowedDataPoints) {
                if (!privacySettings.dataPoints[dataPoint]) {
                    privacySettings.dataPoints[dataPoint] = {
                        label: this.generateLabel(dataPoint),
                        description: `Data point for ${dataPoint}`,
                        category: this.categorizeDataPoint(dataPoint),
                        requestedBy: [request.toolId],
                        globalSetting: true,
                        lastUpdated: new Date().toISOString()
                    };
                }
                else {
                    privacySettings.dataPoints[dataPoint].requestedBy.push(request.toolId);
                    privacySettings.dataPoints[dataPoint].lastUpdated = new Date().toISOString();
                }
            }
            if (!did.permissions) {
                did.permissions = {};
            }
            did.permissions[request.toolId] = {
                granted: true,
                grantedAt: new Date().toISOString(),
                expiresAt: request.expiresAt,
                permissions: request.permissions || [],
                accessToken: undefined
            };
            const accessToken = await this.generateAccessToken(did.id, request.toolId, allowedDataPoints.join(','));
            did.permissions[request.toolId].accessToken = accessToken;
            const sharedData = await this.encryptSharedData(allowedDataPoints, allowedDataPoints.join(','));
            this.logAuditEntry({
                timestamp: new Date().toISOString(),
                toolId: request.toolId,
                action: 'TOOL_ACCESS_GRANTED',
                dataRequested: request.requestedData,
                dataShared: allowedDataPoints,
                userConsent: true
            });
            return {
                granted: true,
                accessToken,
                encryptedData: sharedData,
                message: 'Access granted successfully'
            };
        }
        catch (error) {
            this.logAuditEntry({
                timestamp: new Date().toISOString(),
                toolId: request.toolId,
                action: 'TOOL_REQUEST_ERROR',
                dataRequested: request.requestedData,
                dataShared: [],
                userConsent: false
            });
            return {
                granted: false,
                message: `Error processing request: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    validateToolRequest(request) {
        if (!request.toolId || !/^[a-zA-Z0-9-_]{3,50}$/.test(request.toolId)) {
            throw new types_1.IdentityError('Invalid tool ID format', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!request.toolName || request.toolName.length < 1 || request.toolName.length > 100) {
            throw new types_1.IdentityError('Invalid tool name', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!request.toolDescription || request.toolDescription.length < 10 || request.toolDescription.length > 500) {
            throw new types_1.IdentityError('Invalid tool description', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!Array.isArray(request.requestedData) || request.requestedData.length === 0) {
            throw new types_1.IdentityError('Invalid requested data points', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        for (const dataPoint of request.requestedData) {
            if (typeof dataPoint !== 'string' || !/^[a-zA-Z0-9_]{1,50}$/.test(dataPoint)) {
                throw new types_1.IdentityError(`Invalid data point format: ${dataPoint}`, types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
        }
        if (request.permissions && !Array.isArray(request.permissions)) {
            throw new types_1.IdentityError('Invalid permissions format', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (request.expiresAt) {
            const expirationDate = new Date(request.expiresAt);
            if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
                throw new types_1.IdentityError('Invalid expiration date', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
        }
    }
    detectSuspiciousToolId(toolId) {
        const suspiciousPatterns = [
            /(admin|root|system|test|debug|internal|secret)/i,
            /(sql|script|exec|cmd|shell)/i,
            /(union|select|insert|update|delete|drop)/i,
            /(javascript|vbscript|eval|function)/i,
            /(\.\.\/|\.\.\\)/,
            /[<>"'&]/,
            /[^\w-]/
        ];
        return suspiciousPatterns.some(pattern => pattern.test(toolId));
    }
    validateDataPointRequests(requestedData) {
        const sensitivePatterns = [
            /(password|passwd|secret|key|token|credential)/i,
            /(ssn|social|security|number)/i,
            /(credit|card|bank|account|routing)/i,
            /(private|internal|confidential)/i,
            /(admin|root|system|privileged)/i
        ];
        for (const dataPoint of requestedData) {
            for (const pattern of sensitivePatterns) {
                if (pattern.test(dataPoint)) {
                    return {
                        isValid: false,
                        reason: `Data point '${dataPoint}' matches sensitive pattern`
                    };
                }
            }
        }
        if (requestedData.length > 20) {
            return {
                isValid: false,
                reason: 'Too many data points requested (max 20)'
            };
        }
        const uniqueDataPoints = new Set(requestedData);
        if (uniqueDataPoints.size !== requestedData.length) {
            return {
                isValid: false,
                reason: 'Duplicate data points in request'
            };
        }
        return { isValid: true };
    }
    async registerDataPoints(did, requestedData, toolId) {
        const privacySettings = this.getPrivacySettings(did);
        const currentDataPoints = privacySettings.dataPoints || {};
        requestedData.forEach(dataPointKey => {
            if (!isDataPointAllowed(dataPointKey)) {
                return;
            }
            if (!currentDataPoints[dataPointKey]) {
                currentDataPoints[dataPointKey] = {
                    label: this.generateLabel(dataPointKey),
                    description: `Data point requested by ${toolId}`,
                    category: this.categorizeDataPoint(dataPointKey),
                    requestedBy: [toolId],
                    globalSetting: true,
                    lastUpdated: new Date().toISOString()
                };
            }
            else {
                if (!currentDataPoints[dataPointKey].requestedBy.includes(toolId)) {
                    currentDataPoints[dataPointKey].requestedBy.push(toolId);
                }
            }
        });
        return currentDataPoints;
    }
    generateLabel(dataPointKey) {
        return dataPointKey
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }
    categorizeDataPoint(dataPointKey) {
        const key = dataPointKey.toLowerCase();
        if (key.includes('name') || key.includes('email') || key.includes('phone') || key.includes('address')) {
            return 'identity';
        }
        else if (key.includes('pref') || key.includes('setting') || key.includes('config')) {
            return 'preferences';
        }
        else if (key.includes('content') || key.includes('file') || key.includes('document')) {
            return 'content';
        }
        else {
            return 'analytics';
        }
    }
    getPrivacySettings(did) {
        const defaultSettings = {
            allowAnalytics: false,
            allowMarketing: false,
            allowThirdPartySharing: false,
            dataRetentionDays: 365,
            dataPoints: {}
        };
        if (!did.metadata.privacySettings) {
            did.metadata.privacySettings = defaultSettings;
        }
        return did.metadata.privacySettings;
    }
    updatePrivacySettings(did, settings) {
        did.metadata.privacySettings = settings;
    }
    filterAllowedData(metadata, requestedData) {
        const allowedData = [];
        requestedData.forEach(key => {
            if (!isDataPointAllowed(key))
                return;
            switch (key) {
                case 'displayName':
                    if (metadata.displayName && this.defaultPrivacySettings.shareDisplayName) {
                        allowedData.push({ key, value: metadata.displayName });
                    }
                    break;
                case 'email':
                    if (metadata.email && this.defaultPrivacySettings.shareEmail) {
                        allowedData.push({ key, value: metadata.email });
                    }
                    break;
                case 'preferences':
                    if (metadata.preferences && this.defaultPrivacySettings.sharePreferences) {
                        allowedData.push({ key, value: metadata.preferences });
                    }
                    break;
                case 'customFields':
                    if (metadata.customFields && this.defaultPrivacySettings.shareCustomFields) {
                        allowedData.push({ key, value: metadata.customFields });
                    }
                    break;
                default: {
                    const privacySettings = this.getPrivacySettings({ metadata });
                    if (privacySettings.dataPoints[key]?.globalSetting) {
                        allowedData.push({ key, value: metadata.customFields?.[key] });
                    }
                    break;
                }
            }
        });
        return allowedData;
    }
    async generateAccessToken(didId, toolId, passcode) {
        const data = `${didId}:${toolId}:${Date.now()}`;
        const encrypted = await crypto_1.CryptoManager.encrypt(data, passcode);
        return encrypted.data;
    }
    async encryptSharedData(data, passcode) {
        const encrypted = await crypto_1.CryptoManager.encrypt(JSON.stringify(data), passcode);
        return encrypted.data;
    }
    createDeniedResponse(request, reason) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            toolId: request.toolId,
            action: 'access_denied',
            dataRequested: request.requestedData,
            dataShared: [],
            userConsent: false
        };
        this.logAuditEntry(auditEntry);
        return {
            granted: false,
            message: reason,
            auditLog: auditEntry
        };
    }
    handleExistingAccess(did, request, existingPermission) {
        if (existingPermission.expiresAt && new Date(existingPermission.expiresAt) < new Date()) {
            return this.createDeniedResponse(request, 'Access token expired');
        }
        return {
            granted: true,
            accessToken: existingPermission.accessToken,
            message: 'Access already granted'
        };
    }
    logAuditEntry(entry) {
        this.auditLog.push(entry);
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }
    }
    revokeToolAccess(did, toolId) {
        if (did.permissions[toolId]) {
            delete did.permissions[toolId];
            const auditEntry = {
                timestamp: new Date().toISOString(),
                toolId,
                action: 'access_revoked',
                dataRequested: [],
                dataShared: [],
                userConsent: true
            };
            this.logAuditEntry(auditEntry);
        }
    }
    hasToolAccess(did, toolId) {
        const permission = did.permissions[toolId];
        if (!permission || !permission.granted) {
            return false;
        }
        if (permission.expiresAt && new Date(permission.expiresAt) < new Date()) {
            return false;
        }
        return true;
    }
    getAuditLog(didId) {
        return this.auditLog.filter(entry => entry.toolId === didId);
    }
    logSecurityEvent(securityEvent) {
        const auditEntry = {
            timestamp: securityEvent.timestamp || new Date().toISOString(),
            toolId: securityEvent.didId || 'system',
            action: securityEvent.event || 'security_event',
            dataRequested: [],
            dataShared: [],
            userConsent: false
        };
        this.auditLog.push(auditEntry);
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }
    }
}
exports.PrivacyManager = PrivacyManager;
//# sourceMappingURL=privacy-manager.js.map