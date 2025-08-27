"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMonitor = void 0;
const quantum_resistant_1 = require("../encryption/quantum-resistant");
const hsmManager_1 = require("./hsmManager");
const threat_detection_1 = require("./threat-detection");
class SecurityMonitor {
    constructor(config = {}) {
        this.isInitialized = false;
        this.healthCheckInterval = null;
        this.config = {
            enabled: false,
            quantumResistant: {
                enabled: false,
                algorithm: 'CRYSTALS-Kyber',
                hybridMode: true,
                keySize: 768,
                fallbackToClassical: true,
                securityLevel: '192'
            },
            hsm: {
                enabled: false,
                provider: 'local-hsm',
                fallbackToLocal: true
            },
            threatDetection: {
                enabled: false,
                sensitivity: 'medium',
                monitoringInterval: 30000,
                maxEventsPerHour: 1000,
                alertThreshold: 70,
                autoBlock: false,
                logLevel: 'warn'
            },
            autoUpgrade: false,
            fallbackMode: true,
            monitoringLevel: 'basic',
            ...config
        };
        this.quantumCrypto = new quantum_resistant_1.QuantumResistantCrypto(this.config.quantumResistant);
        this.hsmManager = new hsmManager_1.HSMManager(this.config.hsm);
        this.threatDetection = new threat_detection_1.ThreatDetectionSystem(this.config.threatDetection);
        this.status = {
            overall: 'secure',
            quantumResistant: 'disabled',
            hsm: 'disconnected',
            threatDetection: 'inactive',
            lastCheck: new Date().toISOString(),
            alerts: 0,
            events: 0,
            recommendations: []
        };
        this.metrics = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            averageResponseTime: 0,
            securityScore: 100,
            uptime: 100
        };
    }
    async initialize() {
        if (!this.config.enabled) {
            return;
        }
        try {
            await this.initializeQuantumResistant();
            await this.initializeHSM();
            await this.initializeThreatDetection();
            this.startHealthMonitoring();
            this.isInitialized = true;
            this.updateStatus();
            this.log('info', 'Security monitor initialized successfully');
        }
        catch (error) {
            this.log('error', `Failed to initialize security monitor: ${error}`);
            if (this.config.fallbackMode) {
                this.enableFallbackMode();
            }
        }
    }
    async initializeQuantumResistant() {
        try {
            if (this.config.quantumResistant.enabled) {
                if (this.quantumCrypto.isQuantumResistantAvailable()) {
                    this.status.quantumResistant = 'enabled';
                    this.log('info', 'Quantum-resistant cryptography enabled');
                }
                else {
                    this.status.quantumResistant = 'unavailable';
                    this.log('warn', 'Quantum-resistant cryptography not available, using classical');
                }
            }
            else {
                this.status.quantumResistant = 'disabled';
            }
        }
        catch (error) {
            this.status.quantumResistant = 'unavailable';
            this.log('error', `Quantum-resistant initialization failed: ${error}`);
        }
    }
    async initializeHSM() {
        try {
            if (this.config.hsm.enabled) {
                const connected = await this.hsmManager.initialize();
                if (connected) {
                    this.status.hsm = 'connected';
                    this.log('info', 'HSM connected successfully');
                }
                else {
                    this.status.hsm = 'disconnected';
                    this.log('warn', 'HSM connection failed, using local storage');
                }
            }
            else {
                this.status.hsm = 'disconnected';
            }
        }
        catch (error) {
            this.status.hsm = 'unavailable';
            this.log('error', `HSM initialization failed: ${error}`);
        }
    }
    async initializeThreatDetection() {
        try {
            if (this.config.threatDetection.enabled) {
                await this.threatDetection.initialize();
                this.status.threatDetection = 'active';
                this.log('info', 'Threat detection system active');
            }
            else {
                this.status.threatDetection = 'inactive';
            }
        }
        catch (error) {
            this.status.threatDetection = 'error';
            this.log('error', `Threat detection initialization failed: ${error}`);
        }
    }
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 60000);
    }
    async performHealthCheck() {
        try {
            if (this.config.quantumResistant.enabled) {
                this.status.quantumResistant = this.quantumCrypto.isQuantumResistantAvailable() ? 'enabled' : 'unavailable';
            }
            if (this.config.hsm.enabled) {
                this.status.hsm = this.hsmManager.isHSMConnected() ? 'connected' : 'disconnected';
            }
            if (this.config.threatDetection.enabled) {
                this.status.threatDetection = this.threatDetection.isEnabled() ? 'active' : 'error';
            }
            this.updateMetrics();
            this.updateStatus();
            this.status.lastCheck = new Date().toISOString();
            this.log('info', 'Health check completed');
        }
        catch (error) {
            this.log('error', `Health check failed: ${error}`);
        }
    }
    updateStatus() {
        const alerts = this.threatDetection.getAlerts().filter(a => !a.resolved).length;
        const events = this.threatDetection.getEvents().length;
        this.status.alerts = alerts;
        this.status.events = events;
        let criticalIssues = 0;
        let warnings = 0;
        if (this.status.quantumResistant === 'unavailable' && this.config.quantumResistant.enabled) {
            warnings++;
        }
        if (this.status.hsm === 'unavailable' && this.config.hsm.enabled) {
            warnings++;
        }
        if (this.status.threatDetection === 'error' && this.config.threatDetection.enabled) {
            criticalIssues++;
        }
        if (alerts > 10) {
            criticalIssues++;
        }
        else if (alerts > 5) {
            warnings++;
        }
        if (criticalIssues > 0) {
            this.status.overall = 'critical';
        }
        else if (warnings > 0) {
            this.status.overall = 'warning';
        }
        else {
            this.status.overall = 'secure';
        }
        this.generateRecommendations();
    }
    updateMetrics() {
        const events = this.threatDetection.getEvents();
        const alerts = this.threatDetection.getAlerts();
        this.metrics.totalOperations = events.length;
        this.metrics.successfulOperations = events.filter(e => e.action !== 'blocked').length;
        this.metrics.failedOperations = events.filter(e => e.action === 'blocked').length;
        let score = 100;
        if (this.status.quantumResistant === 'unavailable')
            score -= 10;
        if (this.status.hsm === 'unavailable')
            score -= 15;
        if (this.status.threatDetection === 'error')
            score -= 20;
        if (this.metrics.failedOperations > 0)
            score -= 5;
        if (this.status.alerts > 5)
            score -= 10;
        this.metrics.securityScore = Math.max(0, score);
    }
    generateRecommendations() {
        this.status.recommendations = [];
        if (this.status.quantumResistant === 'unavailable' && this.config.quantumResistant.enabled) {
            this.status.recommendations.push('Enable quantum-resistant cryptography for enhanced security');
        }
        if (this.status.hsm === 'unavailable' && this.config.hsm.enabled) {
            this.status.recommendations.push('Connect to HSM for enterprise-grade key management');
        }
        if (this.status.threatDetection === 'error' && this.config.threatDetection.enabled) {
            this.status.recommendations.push('Fix threat detection system to monitor security events');
        }
        if (this.status.alerts > 5) {
            this.status.recommendations.push('Review and resolve security alerts');
        }
        if (this.metrics.securityScore < 80) {
            this.status.recommendations.push('Security score is low, review security configuration');
        }
    }
    enableFallbackMode() {
        this.log('warn', 'Enabling fallback mode with basic security');
        this.config.quantumResistant.enabled = false;
        this.config.hsm.enabled = false;
        this.config.threatDetection.enabled = false;
        this.status.quantumResistant = 'disabled';
        this.status.hsm = 'disconnected';
        this.status.threatDetection = 'inactive';
        this.status.overall = 'warning';
        this.status.recommendations.push('Enhanced security features disabled, using basic security mode');
    }
    async generateEnhancedKeyPair() {
        try {
            this.metrics.totalOperations++;
            if (this.quantumCrypto.isQuantumResistantAvailable()) {
                const quantumKeyPair = await this.quantumCrypto.generateHybridKeyPair();
                this.metrics.successfulOperations++;
                this.log('info', 'Generated quantum-resistant key pair');
                return quantumKeyPair;
            }
            if (this.hsmManager.isHSMConnected()) {
                const hsmKeyPair = await this.hsmManager.generateKeyPair();
                this.metrics.successfulOperations++;
                this.log('info', 'Generated HSM-protected key pair');
                return hsmKeyPair;
            }
            const classicalKeyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
            this.metrics.successfulOperations++;
            this.log('info', 'Generated classical key pair');
            return classicalKeyPair;
        }
        catch (error) {
            this.metrics.failedOperations++;
            this.log('error', `Key generation failed: ${error}`);
            throw error;
        }
    }
    async signData(data, keyPair) {
        try {
            this.metrics.totalOperations++;
            this.threatDetection.recordEvent({
                type: 'authorization',
                severity: 'medium',
                details: {
                    operation: 'sign',
                    dataLength: data.length,
                    timestamp: new Date().toISOString()
                }
            });
            if (keyPair.quantumResistant && this.quantumCrypto.isQuantumResistantAvailable()) {
                const signature = await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode(data));
                this.metrics.successfulOperations++;
                return this.arrayBufferToBase64(signature);
            }
            if (keyPair.hsmProtected && this.hsmManager.isHSMConnected()) {
                const signature = await this.hsmManager.sign(keyPair.keyId, data);
                this.metrics.successfulOperations++;
                return signature;
            }
            const signature = await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode(data));
            this.metrics.successfulOperations++;
            return this.arrayBufferToBase64(signature);
        }
        catch (error) {
            this.metrics.failedOperations++;
            this.log('error', `Data signing failed: ${error}`);
            throw error;
        }
    }
    async verifySignature(data, signature, publicKey) {
        try {
            this.metrics.totalOperations++;
            this.threatDetection.recordEvent({
                type: 'authorization',
                severity: 'low',
                details: {
                    operation: 'verify',
                    dataLength: data.length,
                    timestamp: new Date().toISOString()
                }
            });
            if (this.quantumCrypto.isQuantumResistantAvailable()) {
                const isValid = await this.quantumCrypto.verifyHybridSignature(signature, publicKey, new TextEncoder().encode(data));
                this.metrics.successfulOperations++;
                return isValid;
            }
            const key = await crypto.subtle.importKey('spki', this.base64ToArrayBuffer(publicKey), 'Ed25519', false, ['verify']);
            const isValid = await crypto.subtle.verify('Ed25519', key, this.base64ToArrayBuffer(signature), new TextEncoder().encode(data));
            this.metrics.successfulOperations++;
            return isValid;
        }
        catch (error) {
            this.metrics.failedOperations++;
            this.log('error', `Signature verification failed: ${error}`);
            return false;
        }
    }
    async upgradeSecurityLevel() {
        if (!this.config.autoUpgrade) {
            return;
        }
        try {
            if (this.status.quantumResistant === 'disabled') {
                this.config.quantumResistant.enabled = true;
                await this.initializeQuantumResistant();
            }
            if (this.status.hsm === 'disconnected') {
                this.config.hsm.enabled = true;
                await this.initializeHSM();
            }
            if (this.status.threatDetection === 'inactive') {
                this.config.threatDetection.enabled = true;
                await this.initializeThreatDetection();
            }
            this.log('info', 'Security level upgraded successfully');
        }
        catch (error) {
            this.log('error', `Security upgrade failed: ${error}`);
        }
    }
    getSecurityStatus() {
        return { ...this.status };
    }
    getSecurityMetrics() {
        return { ...this.metrics };
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (this.isInitialized) {
            this.initialize();
        }
    }
    isEnhancedSecurityAvailable() {
        return (this.quantumCrypto.isQuantumResistantAvailable() ||
            this.hsmManager.isHSMConnected() ||
            this.threatDetection.isEnabled());
    }
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
    log(level, message) {
        console.log(`[SecurityMonitor] ${level.toUpperCase()}: ${message}`);
    }
    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.threatDetection.destroy();
        this.isInitialized = false;
    }
}
exports.SecurityMonitor = SecurityMonitor;
//# sourceMappingURL=security-monitor.js.map