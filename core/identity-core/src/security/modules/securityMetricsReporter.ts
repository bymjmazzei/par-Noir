import { SecurityMetrics, SecurityEvent, SecurityStatus } from '../types/advancedSecurity';

export class SecurityMetricsReporter {
    private metrics: SecurityMetrics;
    private eventHistory: SecurityEvent[];
    private maxHistorySize: number;
    private reportingInterval: number;
    private lastReportTime: number;

    constructor(maxHistorySize: number = 10000, reportingInterval: number = 300000) {
        this.metrics = {
            totalEvents: 0,
            criticalEvents: 0,
            threatsBlocked: 0,
            anomaliesDetected: 0,
            eventsByType: new Map(),
            eventsBySeverity: new Map(),
            eventsByHour: new Array(24).fill(0),
            eventsByDay: new Array(7).fill(0),
            averageResponseTime: 0,
            totalResponseTime: 0,
            responseCount: 0,
            lastUpdated: new Date().toISOString()
        };
        this.eventHistory = [];
        this.maxHistorySize = maxHistorySize;
        this.reportingInterval = reportingInterval;
        this.lastReportTime = Date.now();
    }

    /**
     * Record a security event
     */
    recordEvent(event: SecurityEvent): void {
        // Update metrics
        this.metrics.totalEvents++;
        
        // Update events by type
        const eventTypeCount = this.metrics.eventsByType.get(event.type) || 0;
        this.metrics.eventsByType.set(event.type, eventTypeCount + 1);
        
        // Update events by severity
        const severityCount = this.metrics.eventsBySeverity.get(event.severity) || 0;
        this.metrics.eventsBySeverity.set(event.severity, severityCount + 1);
        
        // Update time-based metrics
        const timestamp = new Date(event.timestamp);
        const hour = timestamp.getHours();
        const dayOfWeek = timestamp.getDay();
        this.metrics.eventsByHour[hour]++;
        this.metrics.eventsByDay[dayOfWeek]++;
        
        // Update response time metrics if available
        if (event.metadata?.responseTime) {
            this.metrics.totalResponseTime += event.metadata.responseTime;
            this.metrics.responseCount++;
            this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.responseCount;
        }
        
        // Update last updated timestamp
        this.metrics.lastUpdated = new Date().toISOString();
        
        // Add to event history
        this.eventHistory.push(event);
        
        // Maintain history size
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Generate security status report
     */
    generateSecurityStatus(): SecurityStatus {
        const now = Date.now();
        const timeSinceLastReport = now - this.lastReportTime;
        
        // Check if it's time for a new report
        if (timeSinceLastReport >= this.reportingInterval) {
            this.lastReportTime = now;
        }

        const totalEvents = this.metrics.totalEvents;
        const highSeverityEvents = this.metrics.eventsBySeverity.get('high') || 0;
        const mediumSeverityEvents = this.metrics.eventsBySeverity.get('medium') || 0;
        const lowSeverityEvents = this.metrics.eventsBySeverity.get('low') || 0;

        // Calculate risk score
        let riskScore = 0;
        if (totalEvents > 0) {
            riskScore += (highSeverityEvents / totalEvents) * 0.6;
            riskScore += (mediumSeverityEvents / totalEvents) * 0.3;
            riskScore += (lowSeverityEvents / totalEvents) * 0.1;
        }

        // Determine overall status
        let status: 'secure' | 'warning' | 'critical' = 'secure';
        if (riskScore > 0.7) {
            status = 'critical';
        } else if (riskScore > 0.4) {
            status = 'warning';
        }

        // Calculate trends
        const recentEvents = this.eventHistory.slice(-100);
        const previousEvents = this.eventHistory.slice(-200, -100);
        
        const recentCount = recentEvents.length;
        const previousCount = previousEvents.length;
        
        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (recentCount > previousCount * 1.2) {
            trend = 'declining';
        } else if (recentCount < previousCount * 0.8) {
            trend = 'improving';
        }

        return {
            overallStatus: status,
            riskScore: Math.round(riskScore * 100) / 100,
            activeThreats: highSeverityEvents,
            recentAnomalies: mediumSeverityEvents,
            secureEnclaveHealth: 100,
            trend,
            lastUpdated: this.metrics.lastUpdated,
            lastIncident: new Date().toISOString(),
            recommendations: this.generateRecommendations(riskScore, trend, highSeverityEvents)
        };
    }

    /**
     * Generate security recommendations
     */
    private generateRecommendations(riskScore: number, trend: string, highSeverityEvents: number): string[] {
        const recommendations: string[] = [];

        if (riskScore > 0.7) {
            recommendations.push('Immediate action required: High security risk detected');
            recommendations.push('Review and investigate all high-severity events');
            recommendations.push('Consider implementing additional security measures');
        } else if (riskScore > 0.4) {
            recommendations.push('Security review recommended: Elevated risk level');
            recommendations.push('Monitor event patterns for unusual activity');
            recommendations.push('Review security policies and procedures');
        }

        if (trend === 'declining') {
            recommendations.push('Event frequency is increasing - investigate root causes');
            recommendations.push('Consider implementing rate limiting or additional monitoring');
        }

        if (highSeverityEvents > 10) {
            recommendations.push('High number of high-severity events - immediate investigation needed');
            recommendations.push('Review access controls and authentication mechanisms');
        }

        if (this.metrics.averageResponseTime > 1000) {
            recommendations.push('High response times detected - performance optimization needed');
            recommendations.push('Review system resources and bottlenecks');
        }

        if (recommendations.length === 0) {
            recommendations.push('Security posture appears healthy - continue monitoring');
        }

        return recommendations;
    }

    /**
     * Get detailed metrics
     */
    getDetailedMetrics(): SecurityMetrics {
        return { ...this.metrics };
    }

    /**
     * Get event history
     */
    getEventHistory(limit: number = 100): SecurityEvent[] {
        return this.eventHistory.slice(-limit);
    }

    /**
     * Get events by type
     */
    getEventsByType(eventType: string): SecurityEvent[] {
        return this.eventHistory.filter(event => event.type === eventType);
    }

    /**
     * Get events by severity
     */
    getEventsBySeverity(severity: string): SecurityEvent[] {
        return this.eventHistory.filter(event => event.severity === severity);
    }

    /**
     * Get events in time range
     */
    getEventsInRange(startTime: Date, endTime: Date): SecurityEvent[] {
        return this.eventHistory.filter(event => {
            const eventTime = new Date(event.timestamp);
            return eventTime >= startTime && eventTime <= endTime;
        });
    }

    /**
     * Get hourly event distribution
     */
    getHourlyDistribution(): number[] {
        return [...this.metrics.eventsByHour];
    }

    /**
     * Get daily event distribution
     */
    getDailyDistribution(): number[] {
        return [...this.metrics.eventsByDay];
    }

    /**
     * Get top event types
     */
    getTopEventTypes(limit: number = 10): Array<{ type: string; count: number }> {
        return Array.from(this.metrics.eventsByType.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Reset metrics
     */
    resetMetrics(): void {
        this.metrics = {
            totalEvents: 0,
            criticalEvents: 0,
            threatsBlocked: 0,
            anomaliesDetected: 0,
            eventsByType: new Map(),
            eventsBySeverity: new Map(),
            eventsByHour: new Array(24).fill(0),
            eventsByDay: new Array(7).fill(0),
            averageResponseTime: 0,
            totalResponseTime: 0,
            responseCount: 0,
            lastUpdated: new Date().toISOString()
        };
        this.eventHistory = [];
        this.lastReportTime = Date.now();
    }

    /**
     * Set max history size
     */
    setMaxHistorySize(size: number): void {
        this.maxHistorySize = Math.max(100, size);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Set reporting interval
     */
    setReportingInterval(interval: number): void {
        this.reportingInterval = Math.max(60000, interval);
    }

    /**
     * Export metrics to JSON
     */
    exportMetrics(): string {
        return JSON.stringify({
            metrics: this.metrics,
            eventHistory: this.eventHistory.slice(-1000), // Export last 1000 events
            exportTime: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary(): {
        totalEvents: number;
        highSeverityCount: number;
        averageResponseTime: number;
        lastUpdated: string;
        eventTypes: number;
    } {
        return {
            totalEvents: this.metrics.totalEvents,
            highSeverityCount: this.metrics.eventsBySeverity.get('high') || 0,
            averageResponseTime: Math.round(this.metrics.averageResponseTime * 100) / 100,
            lastUpdated: this.metrics.lastUpdated,
            eventTypes: this.metrics.eventsByType.size
        };
    }
}
