"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apmService = exports.APMService = void 0;
class APMService {
    constructor(config) {
        this.isInitialized = false;
        this.transactions = new Map();
        this.errors = [];
        this.queue = [];
        this.flushTimer = null;
        this.config = config;
        this.metrics = this.initializeMetrics();
        this.startFlushTimer();
    }
    async initialize() {
        if (!this.config.enabled) {
            console.log('APM is disabled');
            return;
        }
        try {
            await this.simulateAPMConnection();
            this.isInitialized = true;
            console.log('APM initialized successfully');
        }
        catch (error) {
            throw new Error(`Failed to initialize APM: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async simulateAPMConnection() {
        await new Promise(resolve => setTimeout(resolve, 100));
        const success = Math.random() > 0.1;
        if (!success) {
            throw new Error('Failed to connect to APM');
        }
    }
    startTransaction(name, type) {
        const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const transaction = {
            id: transactionId,
            name,
            type,
            startTime: Date.now(),
            spans: []
        };
        this.transactions.set(transactionId, transaction);
        return transactionId;
    }
    endTransaction(transactionId, result, outcome) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return;
        }
        transaction.endTime = Date.now();
        transaction.duration = transaction.endTime - transaction.startTime;
        transaction.result = result;
        transaction.outcome = outcome;
        this.sendTransaction(transaction);
        this.transactions.delete(transactionId);
    }
    startSpan(transactionId, name, type, subtype, action) {
        const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const span = {
            id: spanId,
            transactionId,
            name,
            type,
            subtype,
            action,
            startTime: Date.now()
        };
        const transaction = this.transactions.get(transactionId);
        if (transaction) {
            transaction.spans.push(span);
        }
        return spanId;
    }
    endSpan(spanId, context) {
        for (const transaction of this.transactions.values()) {
            const span = transaction.spans.find(s => s.id === spanId);
            if (span) {
                span.endTime = Date.now();
                span.duration = span.endTime - span.startTime;
                if (context) {
                    span.context = { ...span.context, ...context };
                }
                break;
            }
        }
    }
    captureError(error, transactionId, spanId, context) {
        const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const apmError = {
            id: errorId,
            transactionId,
            spanId,
            timestamp: Date.now(),
            culprit: error.stack?.split('\n')[1] || error.message,
            exception: {
                type: error.constructor.name,
                message: error.message,
                stacktrace: error.stack?.split('\n').slice(1) || []
            },
            context
        };
        this.errors.push(apmError);
        this.sendError(apmError);
        return errorId;
    }
    setTransactionContext(transactionId, context) {
        const transaction = this.transactions.get(transactionId);
        if (transaction) {
            transaction.context = { ...transaction.context, ...context };
        }
    }
    addCustomMetric(name, value, tags) {
        const metric = {
            name,
            value,
            tags,
            timestamp: Date.now()
        };
        this.queue.push({ type: 'metric', data: metric });
    }
    addCustomEvent(name, data) {
        const event = {
            name,
            data,
            timestamp: Date.now()
        };
        this.queue.push({ type: 'event', data: event });
    }
    getMetrics() {
        const transactions = Array.from(this.transactions.values());
        const completedTransactions = transactions.filter(t => t.duration !== undefined);
        if (completedTransactions.length > 0) {
            const durations = completedTransactions.map(t => t.duration).sort((a, b) => a - b);
            const successful = completedTransactions.filter(t => t.outcome === 'success').length;
            this.metrics.transactions = {
                total: completedTransactions.length,
                successful,
                failed: completedTransactions.length - successful,
                avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
                p95Duration: durations[Math.floor(durations.length * 0.95)],
                p99Duration: durations[Math.floor(durations.length * 0.99)]
            };
        }
        this.metrics.errors = {
            total: this.errors.length,
            byType: this.errors.reduce((acc, error) => {
                const type = error.exception.type;
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {})
        };
        this.updatePerformanceMetrics();
        return { ...this.metrics };
    }
    updatePerformanceMetrics() {
        this.metrics.performance = {
            memoryUsage: Math.random() * 100,
            cpuUsage: Math.random() * 100,
            responseTime: Math.random() * 1000,
            throughput: Math.random() * 1000
        };
    }
    initializeMetrics() {
        return {
            transactions: {
                total: 0,
                successful: 0,
                failed: 0,
                avgDuration: 0,
                p95Duration: 0,
                p99Duration: 0
            },
            errors: {
                total: 0,
                byType: {}
            },
            performance: {
                memoryUsage: 0,
                cpuUsage: 0,
                responseTime: 0,
                throughput: 0
            }
        };
    }
    async sendTransaction(transaction) {
        try {
            await this.simulateDataSending('transaction', transaction);
            if (this.config.debug) {
                console.log('APM transaction sent:', transaction);
            }
        }
        catch (error) {
            console.error('Failed to send APM transaction:', error);
        }
    }
    async sendError(error) {
        try {
            await this.simulateDataSending('error', error);
            if (this.config.debug) {
                console.log('APM error sent:', error);
            }
        }
        catch (error) {
            console.error('Failed to send APM error:', error);
        }
    }
    async simulateDataSending(type, data) {
        await new Promise(resolve => setTimeout(resolve, 20));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error(`Failed to send ${type} to APM`);
        }
    }
    startFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flushTimer = setInterval(() => {
            this.flushQueue();
        }, this.config.flushInterval);
    }
    async flushQueue() {
        if (this.queue.length === 0) {
            return;
        }
        const batch = this.queue.splice(0, this.config.maxQueueSize);
        try {
            await this.simulateBatchSending(batch);
            if (this.config.debug) {
                console.log('APM batch sent:', batch.length, 'items');
            }
        }
        catch (error) {
            console.error('Failed to send APM batch:', error);
            this.queue.unshift(...batch);
        }
    }
    async simulateBatchSending(batch) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error('Failed to send batch to APM');
        }
    }
    isReady() {
        return this.isInitialized;
    }
    getConfig() {
        return { ...this.config };
    }
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
            await this.initialize();
        }
        if (newConfig.flushInterval) {
            this.startFlushTimer();
        }
    }
    getActiveTransactions() {
        return new Map(this.transactions);
    }
    getErrors() {
        return [...this.errors];
    }
    clearErrors() {
        this.errors = [];
    }
    getQueueSize() {
        return this.queue.length;
    }
    async flush() {
        await this.flushQueue();
    }
    destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.flushQueue();
    }
}
exports.APMService = APMService;
exports.apmService = new APMService({
    serviceName: process.env.APM_SERVICE_NAME || 'identity-protocol',
    serverUrl: process.env.APM_SERVER_URL || 'https://apm.your-domain.com',
    enabled: process.env.APM_ENABLED === 'true',
    debug: process.env.NODE_ENV === 'development',
    sampleRate: 0.1,
    maxQueueSize: 100,
    flushInterval: 5000
});
//# sourceMappingURL=apmService.js.map