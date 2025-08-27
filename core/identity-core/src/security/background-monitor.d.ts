export interface MonitorConfig {
    enabled: boolean;
    checkInterval: number;
    cleanupInterval: number;
    threatDetectionEnabled: boolean;
    sessionCleanupEnabled: boolean;
    proofCleanupEnabled: boolean;
    logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug';
}
export declare class BackgroundMonitor {
    private static readonly DEFAULT_CONFIG;
    private static monitorInterval;
    private static cleanupInterval;
    private static isRunning;
    static start(config?: Partial<MonitorConfig>): void;
    static stop(): void;
    private static performThreatDetection;
    private static performCleanupTasks;
    static getStats(): {
        isRunning: boolean;
        threatStats: any;
        sessionStats: any;
        proofStats: any;
        lastCheck: string;
    };
    static checkThreats(): void;
    static performCleanup(): void;
    private static log;
    static isActive(): boolean;
    static updateConfig(config: Partial<MonitorConfig>): void;
}
//# sourceMappingURL=background-monitor.d.ts.map