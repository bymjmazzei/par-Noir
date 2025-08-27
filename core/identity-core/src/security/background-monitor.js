"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundMonitor = void 0;
const threat_detector_1 = require("./threat-detector");
const session_manager_1 = require("./session-manager");
const zk_proof_manager_1 = require("./zk-proof-manager");
class BackgroundMonitor {
    static start(config = {}) {
        if (this.isRunning) {
            this.log('Background monitor already running', 'warn');
            return;
        }
        const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
        if (!fullConfig.enabled) {
            this.log('Background monitoring disabled', 'info');
            return;
        }
        this.log('Starting background security monitor', 'info');
        if (fullConfig.threatDetectionEnabled) {
            this.monitorInterval = setInterval(() => {
                this.performThreatDetection();
            }, fullConfig.checkInterval);
        }
        if (fullConfig.sessionCleanupEnabled || fullConfig.proofCleanupEnabled) {
            this.cleanupInterval = setInterval(() => {
                this.performCleanupTasks(fullConfig);
            }, fullConfig.cleanupInterval);
        }
        this.isRunning = true;
        this.log('Background security monitor started', 'info');
    }
    static stop() {
        if (!this.isRunning) {
            return;
        }
        this.log('Stopping background security monitor', 'info');
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.isRunning = false;
        this.log('Background security monitor stopped', 'info');
    }
    static performThreatDetection() {
        try {
            this.log('Performing threat detection scan', 'debug');
            const threatReport = threat_detector_1.ThreatDetector.generateThreatReport();
            if (threatReport.threats.length > 0) {
                this.log(`Detected ${threatReport.threats.length} threats`, 'warn');
                const highRiskThreats = threatReport.threats.filter(t => t.type === 'high');
                if (highRiskThreats.length > 0) {
                    this.log(`High-risk threats detected: ${highRiskThreats.length}`, 'error');
                    for (const threat of highRiskThreats) {
                        this.log(`High-risk threat: ${threat.description}`, 'error');
                    }
                }
                if (threatReport.recommendations.length > 0) {
                    this.log('Security recommendations:', 'warn');
                    for (const recommendation of threatReport.recommendations) {
                        this.log(`- ${recommendation}`, 'warn');
                    }
                }
            }
            else {
                this.log('No threats detected', 'debug');
            }
        }
        catch (error) {
            this.log(`Threat detection error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }
    static performCleanupTasks(config) {
        try {
            this.log('Performing cleanup tasks', 'debug');
            if (config.sessionCleanupEnabled) {
                this.log('Cleaning up expired sessions', 'debug');
            }
            if (config.proofCleanupEnabled) {
                this.log('Cleaning up expired proofs', 'debug');
                zk_proof_manager_1.ZKProofManager.cleanupExpiredProofs();
            }
            this.log('Cleaning up old security events', 'debug');
            threat_detector_1.ThreatDetector.cleanupOldEvents();
            this.log('Cleanup tasks completed', 'debug');
        }
        catch (error) {
            this.log(`Cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }
    static getStats() {
        return {
            isRunning: this.isRunning,
            threatStats: threat_detector_1.ThreatDetector.getThreatStats(),
            sessionStats: session_manager_1.SessionManager.getSessionStats(),
            proofStats: zk_proof_manager_1.ZKProofManager.getProofStats(),
            lastCheck: new Date().toISOString()
        };
    }
    static checkThreats() {
        this.performThreatDetection();
    }
    static performCleanup() {
        this.performCleanupTasks(this.DEFAULT_CONFIG);
    }
    static log(message, level) {
        const config = this.DEFAULT_CONFIG;
        const levels = ['none', 'error', 'warn', 'info', 'debug'];
        const currentLevelIndex = levels.indexOf(config.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        if (messageLevelIndex <= currentLevelIndex) {
            const timestamp = new Date().toISOString();
            const prefix = `[BackgroundMonitor:${level.toUpperCase()}]`;
            switch (level) {
                case 'error':
                    console.error(`${timestamp} ${prefix} ${message}`);
                    break;
                case 'warn':
                    console.warn(`${timestamp} ${prefix} ${message}`);
                    break;
                case 'info':
                    console.info(`${timestamp} ${prefix} ${message}`);
                    break;
                case 'debug':
                    console.debug(`${timestamp} ${prefix} ${message}`);
                    break;
            }
        }
    }
    static isActive() {
        return this.isRunning;
    }
    static updateConfig(config) {
        const newConfig = { ...this.DEFAULT_CONFIG, ...config };
        if (this.isRunning) {
            this.stop();
            this.start(newConfig);
        }
    }
}
exports.BackgroundMonitor = BackgroundMonitor;
BackgroundMonitor.DEFAULT_CONFIG = {
    enabled: true,
    checkInterval: 5 * 60 * 1000,
    cleanupInterval: 60 * 60 * 1000,
    threatDetectionEnabled: true,
    sessionCleanupEnabled: true,
    proofCleanupEnabled: true,
    logLevel: 'warn'
};
BackgroundMonitor.monitorInterval = null;
BackgroundMonitor.cleanupInterval = null;
BackgroundMonitor.isRunning = false;
//# sourceMappingURL=background-monitor.js.map