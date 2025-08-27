"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceSecurityManager = void 0;
const types_1 = require("../types");
class DeviceSecurityManager {
    constructor(config = {}) {
        this.deviceFingerprint = null;
        this.threatHistory = [];
        this.behavioralHistory = [];
        this.securityEvents = [];
        this.config = {
            enableWebAuthn: true,
            enableThreatDetection: true,
            enableBehavioralAnalysis: true,
            enableMalwareDetection: true,
            enableDeviceFingerprinting: true,
            securityLevel: 'military',
            ...config
        };
    }
    async initialize() {
        try {
            if (this.config.enableDeviceFingerprinting) {
                this.deviceFingerprint = await this.generateDeviceFingerprint();
            }
            if (this.config.enableThreatDetection) {
                await this.startThreatDetection();
            }
            if (this.config.enableBehavioralAnalysis) {
                await this.startBehavioralAnalysis();
            }
            this.logSecurityEvent('device_security_initialized', { config: this.config });
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to initialize device security', types_1.IdentityErrorCodes.SECURITY_ERROR, error);
        }
    }
    async generateDeviceFingerprint() {
        const components = {
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 0,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            canvasFingerprint: await this.generateCanvasFingerprint(),
            webglFingerprint: await this.generateWebGLFingerprint(),
            audioFingerprint: await this.generateAudioFingerprint(),
            fontFingerprint: await this.generateFontFingerprint()
        };
        const fingerprintData = JSON.stringify(components);
        const hash = await this.hashData(fingerprintData);
        return {
            id: crypto.randomUUID(),
            components,
            hash,
            timestamp: new Date().toISOString()
        };
    }
    async generateCanvasFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return '';
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Identity Protocol Security', 2, 2);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Identity Protocol Security', 4, 4);
        return canvas.toDataURL();
    }
    async generateWebGLFingerprint() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl)
            return '';
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo)
            return '';
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return `${vendor}-${renderer}`;
    }
    async generateAudioFingerprint() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            const gainNode = audioContext.createGain();
            const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
            gainNode.gain.value = 0;
            oscillator.type = 'triangle';
            oscillator.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start(0);
            const audioData = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(audioData);
            oscillator.stop();
            audioContext.close();
            return Array.from(audioData).slice(0, 10).join(',');
        }
        catch (error) {
            return 'audio_not_supported';
        }
    }
    async generateFontFingerprint() {
        const fonts = [
            'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New',
            'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
            'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Console'
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return '';
        const baseFont = 'monospace';
        const baseWidth = ctx.measureText('Identity Protocol').width;
        const availableFonts = [];
        for (const font of fonts) {
            ctx.font = `12px ${font}`;
            const width = ctx.measureText('Identity Protocol').width;
            if (width !== baseWidth) {
                availableFonts.push(font);
            }
        }
        return availableFonts.join(',');
    }
    async startThreatDetection() {
        setInterval(async () => {
            const threatResult = await this.detectThreats();
            if (threatResult.isThreat) {
                this.threatHistory.push(threatResult);
                this.handleThreat(threatResult);
            }
        }, 30000);
    }
    async detectThreats() {
        const threats = [];
        let threatLevel = 'low';
        let confidence = 0;
        if (await this.detectSuspiciousExtensions()) {
            threats.push('Suspicious browser extensions detected');
            threatLevel = 'medium';
            confidence += 0.3;
        }
        if (await this.detectFingerprintChanges()) {
            threats.push('Device fingerprint changed unexpectedly');
            threatLevel = 'high';
            confidence += 0.4;
        }
        if (await this.detectMalwareSignatures()) {
            threats.push('Malware signatures detected');
            threatLevel = 'critical';
            confidence += 0.8;
        }
        if (await this.detectSuspiciousNetworkActivity()) {
            threats.push('Suspicious network activity detected');
            threatLevel = 'medium';
            confidence += 0.3;
        }
        return {
            isThreat: threats.length > 0,
            threatLevel,
            threats,
            confidence: Math.min(confidence, 1.0),
            recommendations: this.generateThreatRecommendations(threats)
        };
    }
    async detectSuspiciousExtensions() {
        const suspiciousPatterns = [
            'password',
            'key',
            'crypto',
            'wallet',
            'identity',
            'auth'
        ];
        return false;
    }
    async detectFingerprintChanges() {
        if (!this.deviceFingerprint)
            return false;
        const currentFingerprint = await this.generateDeviceFingerprint();
        const originalHash = this.deviceFingerprint.hash;
        const currentHash = currentFingerprint.hash;
        return originalHash !== currentHash;
    }
    async detectMalwareSignatures() {
        const malwarePatterns = [
            'keylogger',
            'screen_capture',
            'memory_dump',
            'process_injection'
        ];
        return false;
    }
    async detectSuspiciousNetworkActivity() {
        return false;
    }
    async startBehavioralAnalysis() {
        setInterval(async () => {
            const behaviorResult = await this.analyzeBehavior();
            if (behaviorResult.isAnomalous) {
                this.behavioralHistory.push(behaviorResult);
                this.handleAnomalousBehavior(behaviorResult);
            }
        }, 60000);
    }
    async analyzeBehavior() {
        const detectedBehaviors = [];
        let anomalyScore = 0;
        if (await this.detectUnusualTypingPatterns()) {
            detectedBehaviors.push('Unusual typing patterns');
            anomalyScore += 0.3;
        }
        if (await this.detectUnusualMouseMovements()) {
            detectedBehaviors.push('Unusual mouse movements');
            anomalyScore += 0.2;
        }
        if (await this.detectUnusualTimingPatterns()) {
            detectedBehaviors.push('Unusual timing patterns');
            anomalyScore += 0.4;
        }
        const riskLevel = anomalyScore < 0.3 ? 'low' :
            anomalyScore < 0.7 ? 'medium' : 'high';
        return {
            isAnomalous: anomalyScore > 0.5,
            anomalyScore: Math.min(anomalyScore, 1.0),
            detectedBehaviors,
            riskLevel
        };
    }
    async detectUnusualTypingPatterns() {
        return false;
    }
    async detectUnusualMouseMovements() {
        return false;
    }
    async detectUnusualTimingPatterns() {
        return false;
    }
    handleThreat(threat) {
        this.logSecurityEvent('threat_detected', threat);
        if (threat.threatLevel === 'critical') {
            this.triggerEmergencyLockdown();
        }
        else if (threat.threatLevel === 'high') {
            this.triggerEnhancedSecurity();
        }
        else {
            this.triggerWarning(threat);
        }
    }
    handleAnomalousBehavior(behavior) {
        this.logSecurityEvent('anomalous_behavior_detected', behavior);
        if (behavior.riskLevel === 'high') {
            this.triggerEnhancedSecurity();
        }
        else {
            this.triggerWarning({ message: 'Anomalous behavior detected', details: behavior });
        }
    }
    triggerEmergencyLockdown() {
        this.logSecurityEvent('emergency_lockdown_triggered', {});
    }
    triggerEnhancedSecurity() {
        this.logSecurityEvent('enhanced_security_triggered', {});
    }
    triggerWarning(warning) {
        this.logSecurityEvent('security_warning', warning);
    }
    generateThreatRecommendations(threats) {
        const recommendations = [];
        if (threats.includes('Suspicious browser extensions detected')) {
            recommendations.push('Review and disable suspicious browser extensions');
            recommendations.push('Use only trusted extensions from official stores');
        }
        if (threats.includes('Device fingerprint changed unexpectedly')) {
            recommendations.push('Check for unauthorized device changes');
            recommendations.push('Verify device integrity');
        }
        if (threats.includes('Malware signatures detected')) {
            recommendations.push('Run full system malware scan');
            recommendations.push('Update security software');
            recommendations.push('Consider using a clean device');
        }
        if (threats.includes('Suspicious network activity detected')) {
            recommendations.push('Check network security');
            recommendations.push('Use VPN if available');
            recommendations.push('Avoid public networks');
        }
        return recommendations;
    }
    async hashData(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
    logSecurityEvent(event, details) {
        this.securityEvents.push({
            timestamp: new Date().toISOString(),
            event,
            details
        });
        if (this.securityEvents.length > 1000) {
            this.securityEvents = this.securityEvents.slice(-1000);
        }
    }
    getDeviceFingerprint() {
        return this.deviceFingerprint;
    }
    getThreatHistory() {
        return this.threatHistory;
    }
    getBehavioralHistory() {
        return this.behavioralHistory;
    }
    getSecurityEvents() {
        return this.securityEvents;
    }
}
exports.DeviceSecurityManager = DeviceSecurityManager;
//# sourceMappingURL=device-security.js.map