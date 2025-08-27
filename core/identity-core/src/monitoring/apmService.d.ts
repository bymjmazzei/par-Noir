export interface APMConfig {
    serviceName: string;
    serverUrl: string;
    enabled: boolean;
    debug: boolean;
    sampleRate: number;
    maxQueueSize: number;
    flushInterval: number;
}
export interface APMTransaction {
    id: string;
    name: string;
    type: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    result?: string;
    outcome?: 'success' | 'failure' | 'unknown';
    context?: {
        user?: {
            id?: string;
            email?: string;
            username?: string;
        };
        request?: {
            method?: string;
            url?: string;
            headers?: Record<string, string>;
            body?: any;
        };
        response?: {
            status_code?: number;
            headers?: Record<string, string>;
            body?: any;
        };
        tags?: Record<string, string>;
        custom?: Record<string, any>;
    };
    spans: APMSpan[];
}
export interface APMSpan {
    id: string;
    transactionId: string;
    name: string;
    type: string;
    subtype?: string;
    action?: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    context?: {
        db?: {
            statement?: string;
            type?: string;
            user?: string;
            rows_affected?: number;
        };
        http?: {
            url?: string;
            method?: string;
            status_code?: number;
        };
        tags?: Record<string, string>;
        custom?: Record<string, any>;
    };
}
export interface APMError {
    id: string;
    transactionId?: string;
    spanId?: string;
    timestamp: number;
    culprit: string;
    exception: {
        type: string;
        message: string;
        stacktrace?: string[];
    };
    context?: {
        user?: {
            id?: string;
            email?: string;
            username?: string;
        };
        tags?: Record<string, string>;
        custom?: Record<string, any>;
    };
}
export interface APMMetrics {
    transactions: {
        total: number;
        successful: number;
        failed: number;
        avgDuration: number;
        p95Duration: number;
        p99Duration: number;
    };
    errors: {
        total: number;
        byType: Record<string, number>;
    };
    performance: {
        memoryUsage: number;
        cpuUsage: number;
        responseTime: number;
        throughput: number;
    };
}
export declare class APMService {
    private config;
    private isInitialized;
    private transactions;
    private errors;
    private metrics;
    private queue;
    private flushTimer;
    constructor(config: APMConfig);
    initialize(): Promise<void>;
    private simulateAPMConnection;
    startTransaction(name: string, type: string): string;
    endTransaction(transactionId: string, result?: string, outcome?: 'success' | 'failure' | 'unknown'): void;
    startSpan(transactionId: string, name: string, type: string, subtype?: string, action?: string): string;
    endSpan(spanId: string, context?: APMSpan['context']): void;
    captureError(error: Error, transactionId?: string, spanId?: string, context?: APMError['context']): string;
    setTransactionContext(transactionId: string, context: APMTransaction['context']): void;
    addCustomMetric(name: string, value: number, tags?: Record<string, string>): void;
    addCustomEvent(name: string, data: Record<string, any>): void;
    getMetrics(): APMMetrics;
    private updatePerformanceMetrics;
    private initializeMetrics;
    private sendTransaction;
    private sendError;
    private simulateDataSending;
    private startFlushTimer;
    private flushQueue;
    private simulateBatchSending;
    isReady(): boolean;
    getConfig(): APMConfig;
    updateConfig(newConfig: Partial<APMConfig>): Promise<void>;
    getActiveTransactions(): Map<string, APMTransaction>;
    getErrors(): APMError[];
    clearErrors(): void;
    getQueueSize(): number;
    flush(): Promise<void>;
    destroy(): void;
}
export declare const apmService: APMService;
//# sourceMappingURL=apmService.d.ts.map