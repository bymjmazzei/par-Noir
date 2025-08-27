"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataValidator = void 0;
class MetadataValidator {
    static validateMetadata(metadata, config = {}) {
        const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
        const issues = [];
        let sanitizedData;
        try {
            sanitizedData = JSON.parse(JSON.stringify(metadata));
            const structureIssues = this.validateStructure(sanitizedData, fullConfig);
            issues.push(...structureIssues);
            const injectionIssues = this.detectInjectionAttempts(sanitizedData);
            issues.push(...injectionIssues);
            const suspiciousIssues = this.detectSuspiciousData(sanitizedData);
            issues.push(...suspiciousIssues);
            sanitizedData = this.sanitizeMetadata(sanitizedData, fullConfig);
            const customFieldIssues = this.validateCustomFields(sanitizedData, fullConfig);
            issues.push(...customFieldIssues);
            const riskLevel = this.calculateRiskLevel(issues);
            return {
                isValid: issues.length === 0,
                issues,
                sanitizedData,
                riskLevel
            };
        }
        catch (error) {
            return {
                isValid: false,
                issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
                sanitizedData: {},
                riskLevel: 'high'
            };
        }
    }
    static validateStructure(metadata, config) {
        const issues = [];
        if (this.hasCircularReferences(metadata)) {
            issues.push('Circular reference detected in metadata');
        }
        if (this.getObjectDepth(metadata) > 10) {
            issues.push('Metadata object too deep (max 10 levels)');
        }
        const metadataSize = JSON.stringify(metadata).length;
        if (metadataSize > config.maxFieldLength * 10) {
            issues.push(`Metadata too large (${metadataSize} bytes, max ${config.maxFieldLength * 10})`);
        }
        return issues;
    }
    static detectInjectionAttempts(metadata) {
        const issues = [];
        const metadataString = JSON.stringify(metadata);
        for (const pattern of this.FORBIDDEN_PATTERNS) {
            if (pattern.test(metadataString)) {
                issues.push(`Potential injection detected: ${pattern.source}`);
            }
        }
        return issues;
    }
    static detectSuspiciousData(metadata) {
        const issues = [];
        const metadataString = JSON.stringify(metadata).toLowerCase();
        for (const pattern of this.SUSPICIOUS_PATTERNS) {
            if (pattern.test(metadataString)) {
                issues.push(`Suspicious data pattern detected: ${pattern.source}`);
            }
        }
        return issues;
    }
    static sanitizeMetadata(metadata, config) {
        if (typeof metadata === 'string') {
            return this.sanitizeString(metadata, config);
        }
        if (Array.isArray(metadata)) {
            return metadata.map(item => this.sanitizeMetadata(item, config));
        }
        if (typeof metadata === 'object' && metadata !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(metadata)) {
                const sanitizedKey = this.sanitizeString(key, config);
                const sanitizedValue = this.sanitizeMetadata(value, config);
                if (sanitizedKey && sanitizedKey.length > 0) {
                    sanitized[sanitizedKey] = sanitizedValue;
                }
            }
            return sanitized;
        }
        return metadata;
    }
    static sanitizeString(str, config) {
        if (typeof str !== 'string') {
            return String(str);
        }
        let sanitized = str;
        for (const pattern of this.FORBIDDEN_PATTERNS) {
            sanitized = sanitized.replace(pattern, '');
        }
        if (sanitized.length > config.maxFieldLength) {
            sanitized = sanitized.substring(0, config.maxFieldLength);
        }
        sanitized = sanitized.replace(/\0/g, '');
        sanitized = sanitized.replace(/\s+/g, ' ').trim();
        return sanitized;
    }
    static validateCustomFields(metadata, config) {
        const issues = [];
        if (metadata.customFields && typeof metadata.customFields === 'object') {
            const customFields = metadata.customFields;
            const fieldCount = Object.keys(customFields).length;
            if (fieldCount > config.maxCustomFields) {
                issues.push(`Too many custom fields (${fieldCount}, max ${config.maxCustomFields})`);
            }
            for (const [key, value] of Object.entries(customFields)) {
                const valueString = JSON.stringify(value);
                if (valueString.length > config.maxFieldLength) {
                    issues.push(`Custom field '${key}' too large (${valueString.length} bytes, max ${config.maxFieldLength})`);
                }
            }
        }
        return issues;
    }
    static calculateRiskLevel(issues) {
        const highRiskKeywords = ['injection', 'script', 'exec', 'malware', 'virus'];
        const mediumRiskKeywords = ['suspicious', 'large', 'deep', 'circular'];
        const highRiskCount = issues.filter(issue => highRiskKeywords.some(keyword => issue.toLowerCase().includes(keyword))).length;
        const mediumRiskCount = issues.filter(issue => mediumRiskKeywords.some(keyword => issue.toLowerCase().includes(keyword))).length;
        if (highRiskCount > 0)
            return 'high';
        if (mediumRiskCount > 0 || issues.length > 5)
            return 'medium';
        return 'low';
    }
    static hasCircularReferences(obj, seen = new WeakSet()) {
        if (obj === null || typeof obj !== 'object') {
            return false;
        }
        if (seen.has(obj)) {
            return true;
        }
        seen.add(obj);
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (this.hasCircularReferences(obj[key], seen)) {
                    return true;
                }
            }
        }
        return false;
    }
    static getObjectDepth(obj, depth = 0) {
        if (obj === null || typeof obj !== 'object') {
            return depth;
        }
        let maxDepth = depth;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                maxDepth = Math.max(maxDepth, this.getObjectDepth(obj[key], depth + 1));
            }
        }
        return maxDepth;
    }
    static silentValidate(metadata) {
        const result = this.validateMetadata(metadata);
        if (!result.isValid) {
            console.warn('Metadata validation issues auto-fixed:', result.issues);
            return result.sanitizedData;
        }
        return metadata;
    }
}
exports.MetadataValidator = MetadataValidator;
MetadataValidator.DEFAULT_CONFIG = {
    maxCustomFields: 100,
    maxFieldLength: 10000,
    allowScripts: false,
    allowExternalLinks: false,
    strictMode: true
};
MetadataValidator.FORBIDDEN_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /data:application\/javascript/gi,
    /on\w+\s*=/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /expression\s*\(/gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /(\b(union|select|insert|update|delete|drop|create|alter)\b)/gi,
    /(\b(exec|execute|sp_|xp_)\b)/gi,
    /\.\.\/|\.\.\\/gi,
    /\/etc\/passwd/gi,
    /\/proc\/self/gi,
    /(\b(cmd|command|shell|bash|powershell)\b)/gi,
    /(\||&|;|`|$\(|\))/gi
];
MetadataValidator.SUSPICIOUS_PATTERNS = [
    /password/i,
    /secret/i,
    /private_key/i,
    /credit_card/i,
    /ssn/i,
    /social_security/i,
    /api_key/i,
    /access_token/i,
    /refresh_token/i,
    /malware/i,
    /virus/i,
    /trojan/i,
    /backdoor/i,
    /exploit/i
];
MetadataValidator.ALLOWED_HTML_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'i', 'b', 'span', 'div'
];
//# sourceMappingURL=metadata-validator.js.map