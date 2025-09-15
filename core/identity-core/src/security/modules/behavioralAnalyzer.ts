import { BehavioralProfile, SecurityEvent } from '../types/advancedSecurity';

export class BehavioralAnalyzer {
    private behavioralProfiles: Map<string, BehavioralProfile>;
    private anomalyThreshold: number;
    private learningRate: number;

    constructor(anomalyThreshold: number = 0.8, learningRate: number = 0.1) {
        this.behavioralProfiles = new Map();
        this.anomalyThreshold = anomalyThreshold;
        this.learningRate = learningRate;
    }

    /**
     * Create or update behavioral profile
     */
    updateBehavioralProfile(userId: string, event: SecurityEvent): void {
        if (!this.behavioralProfiles.has(userId)) {
            this.behavioralProfiles.set(userId, {
                userId,
                patterns: new Map(),
                baseline: {
                    averageLoginTime: 0,
                    commonLocations: [],
                    commonDevices: [],
                    commonActions: [],
                    averageTypingSpeed: 0,
                    averageMouseSpeed: 0
                },
                lastUpdated: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                confidence: 0,
                riskScore: 0,
                anomalyCount: 0,
                learningData: []
            });
        }

        const profile = this.behavioralProfiles.get(userId)!;
        this.updatePatterns(profile, event);
        this.calculateRiskScore(profile);
        profile.lastActivity = new Date().toISOString();
    }

    /**
     * Update behavioral patterns
     */
    private updatePatterns(profile: BehavioralProfile, event: SecurityEvent): void {
        const eventType = event.type;
        const timestamp = new Date(event.timestamp);
        const hour = timestamp.getHours();
        const dayOfWeek = timestamp.getDay();

        // Update time-based patterns
        if (!profile.patterns.has('timePatterns')) {
            profile.patterns.set('timePatterns', {
                hourly: new Array(24).fill(0),
                daily: new Array(7).fill(0),
                total: 0
            });
        }

        const timePatterns = profile.patterns.get('timePatterns') as any;
        timePatterns.hourly[hour]++;
        timePatterns.daily[dayOfWeek]++;
        timePatterns.total++;

        // Update event type patterns
        if (!profile.patterns.has('eventTypePatterns')) {
            profile.patterns.set('eventTypePatterns', new Map());
        }

        const eventTypePatterns = profile.patterns.get('eventTypePatterns') as Map<string, number>;
        eventTypePatterns.set(eventType, (eventTypePatterns.get(eventType) || 0) + 1);

        // Update location patterns if available
        if (event.metadata?.location) {
            if (!profile.patterns.has('locationPatterns')) {
                profile.patterns.set('locationPatterns', new Map());
            }

            const locationPatterns = profile.patterns.get('locationPatterns') as Map<string, number>;
            locationPatterns.set(event.metadata.location, (locationPatterns.get(event.metadata.location) || 0) + 1);
        }

        // Add to learning data
        profile.learningData.push({
            id: event.id,
            timestamp: event.timestamp,
            type: event.type,
            severity: event.severity,
            details: event.details,
            source: event.source,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            deviceFingerprint: event.deviceFingerprint,
            location: event.location,
            riskScore: event.riskScore,
            mitigated: event.mitigated,
            userId: event.userId,
            metadata: event.metadata
        });

        // Keep only recent learning data (last 1000 events)
        if (profile.learningData.length > 1000) {
            profile.learningData = profile.learningData.slice(-1000);
        }
    }

    /**
     * Calculate risk score based on behavioral patterns
     */
    private calculateRiskScore(profile: BehavioralProfile): void {
        let riskScore = 0;

        // Time-based anomaly detection
        const timePatterns = profile.patterns.get('timePatterns') as any;
        if (timePatterns) {
            const totalEvents = timePatterns.total;
            if (totalEvents > 0) {
                const avgHourly = totalEvents / 24;
                const currentHour = new Date().getHours();
                const currentHourEvents = timePatterns.hourly[currentHour];
                
                if (currentHourEvents > avgHourly * 3) {
                    riskScore += 0.3;
                }
            }
        }

        // Event type anomaly detection
        const eventTypePatterns = profile.patterns.get('eventTypePatterns') as Map<string, number>;
        if (eventTypePatterns) {
            const totalEvents = Array.from(eventTypePatterns.values()).reduce((sum, count) => sum + count, 0);
            if (totalEvents > 0) {
                const avgEventTypeCount = totalEvents / eventTypePatterns.size;
                for (const [eventType, count] of eventTypePatterns.entries()) {
                    if (count > avgEventTypeCount * 2) {
                        riskScore += 0.2;
                    }
                }
            }
        }

        // Recent anomaly detection
        const recentEvents = profile.learningData.slice(-10);
        const highSeverityEvents = recentEvents.filter(event => event.severity === 'high').length;
        if (highSeverityEvents > 3) {
            riskScore += 0.4;
        }

        // Update risk score with learning
        profile.riskScore = Math.min(1.0, profile.riskScore * (1 - this.learningRate) + riskScore * this.learningRate);

        // Update anomaly count
        if (riskScore > this.anomalyThreshold) {
            profile.anomalyCount++;
        }
    }

    /**
     * Detect behavioral anomalies
     */
    detectAnomalies(userId: string): { isAnomaly: boolean; confidence: number; details: string[] } {
        const profile = this.behavioralProfiles.get(userId);
        if (!profile) {
            return { isAnomaly: false, confidence: 0, details: [] };
        }

        const details: string[] = [];
        let confidence = 0;

        // Check risk score
        if (profile.riskScore > this.anomalyThreshold) {
            confidence += 0.4;
            details.push(`High risk score: ${profile.riskScore.toFixed(2)}`);
        }

        // Check time patterns
        const timePatterns = profile.patterns.get('timePatterns') as any;
        if (timePatterns) {
            const currentHour = new Date().getHours();
            const currentHourEvents = timePatterns.hourly[currentHour];
            const avgHourly = timePatterns.total / 24;
            
            if (currentHourEvents > avgHourly * 3) {
                confidence += 0.3;
                details.push(`Unusual activity at hour ${currentHour}: ${currentHourEvents} events vs ${avgHourly.toFixed(1)} average`);
            }
        }

        // Check event type patterns
        const eventTypePatterns = profile.patterns.get('eventTypePatterns') as Map<string, number>;
        if (eventTypePatterns) {
            const totalEvents = Array.from(eventTypePatterns.values()).reduce((sum, count) => sum + count, 0);
            if (totalEvents > 0) {
                const avgEventTypeCount = totalEvents / eventTypePatterns.size;
                for (const [eventType, count] of eventTypePatterns.entries()) {
                    if (count > avgEventTypeCount * 2) {
                        confidence += 0.2;
                        details.push(`Unusual ${eventType} activity: ${count} events vs ${avgEventTypeCount.toFixed(1)} average`);
                    }
                }
            }
        }

        // Check recent high-severity events
        const recentEvents = profile.learningData.slice(-10);
        const highSeverityEvents = recentEvents.filter(event => event.severity === 'high').length;
        if (highSeverityEvents > 3) {
            confidence += 0.3;
            details.push(`Multiple high-severity events in recent activity: ${highSeverityEvents}`);
        }

        const isAnomaly = confidence > this.anomalyThreshold;

        return {
            isAnomaly,
            confidence: Math.min(1.0, confidence),
            details
        };
    }

    /**
     * Get behavioral profile
     */
    getBehavioralProfile(userId: string): BehavioralProfile | undefined {
        return this.behavioralProfiles.get(userId);
    }

    /**
     * Get all behavioral profiles
     */
    getAllBehavioralProfiles(): Map<string, BehavioralProfile> {
        return new Map(this.behavioralProfiles);
    }

    /**
     * Remove behavioral profile
     */
    removeBehavioralProfile(userId: string): boolean {
        return this.behavioralProfiles.delete(userId);
    }

    /**
     * Update anomaly threshold
     */
    setAnomalyThreshold(threshold: number): void {
        this.anomalyThreshold = Math.max(0, Math.min(1, threshold));
    }

    /**
     * Update learning rate
     */
    setLearningRate(rate: number): void {
        this.learningRate = Math.max(0, Math.min(1, rate));
    }

    /**
     * Get profile count
     */
    getProfileCount(): number {
        return this.behavioralProfiles.size;
    }

    /**
     * Clear all profiles
     */
    clearAllProfiles(): void {
        this.behavioralProfiles.clear();
    }
}
