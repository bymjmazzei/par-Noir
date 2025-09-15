// import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
import { ThreatIntel, ThreatIntelContext, SecurityIndicator } from '../types/siem';

export class ThreatIntelManager {
  private threatIntel: Map<string, ThreatIntel> = new Map();

  /**
   * Add threat intelligence
   */
  addThreatIntel(
    indicator: string,
    type: 'ip' | 'domain' | 'email' | 'hash' | 'url',
    threatLevel: 'low' | 'medium' | 'high' | 'critical',
    confidence: number,
    context?: ThreatIntelContext
  ): void {
    const existing = this.threatIntel.get(indicator);
    
    if (existing) {
      // Update existing threat intelligence
      existing.threat_level = threatLevel;
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.last_seen = Date.now();
      existing.sources = [...new Set([...existing.sources, ...(context?.sources || [])])];
      existing.tags = [...new Set([...existing.tags, ...(context?.tags || [])])];
      
      if (context?.description && !existing.description) {
        existing.description = context.description;
      }
      
      if (context?.mitigation && !existing.mitigation) {
        existing.mitigation = context.mitigation;
      }
      
      if (context?.references) {
        existing.references = [...new Set([...(existing.references || []), ...context.references])];
      }
    } else {
      // Create new threat intelligence
      const newThreatIntel: ThreatIntel = {
        indicator,
        type,
        threat_level: threatLevel,
        confidence,
        sources: context?.sources || [],
        first_seen: Date.now(),
        last_seen: Date.now(),
        tags: context?.tags || [],
        description: context?.description,
        mitigation: context?.mitigation,
        references: context?.references
      };
      
      this.threatIntel.set(indicator, newThreatIntel);
    }
  }

  /**
   * Get threat intelligence by indicator
   */
  getThreatIntel(indicator: string): ThreatIntel | undefined {
    return this.threatIntel.get(indicator);
  }

  /**
   * Get all threat intelligence
   */
  getAllThreatIntel(): ThreatIntel[] {
    return Array.from(this.threatIntel.values());
  }

  /**
   * Get threat intelligence by type
   */
  getThreatIntelByType(type: 'ip' | 'domain' | 'email' | 'hash' | 'url'): ThreatIntel[] {
    return Array.from(this.threatIntel.values()).filter(threat => threat.type === type);
  }

  /**
   * Get threat intelligence by threat level
   */
  getThreatIntelByLevel(level: 'low' | 'medium' | 'high' | 'critical'): ThreatIntel[] {
    return Array.from(this.threatIntel.values()).filter(threat => threat.threat_level === level);
  }

  /**
   * Get threat intelligence by tag
   */
  getThreatIntelByTag(tag: string): ThreatIntel[] {
    return Array.from(this.threatIntel.values()).filter(threat => 
      threat.tags.includes(tag)
    );
  }

  /**
   * Get threat intelligence by source
   */
  getThreatIntelBySource(source: string): ThreatIntel[] {
    return Array.from(this.threatIntel.values()).filter(threat => 
      threat.sources.includes(source)
    );
  }

  /**
   * Get threat intelligence by time range
   */
  getThreatIntelByTimeRange(start: number, end: number): ThreatIntel[] {
    return Array.from(this.threatIntel.values()).filter(threat => 
      threat.last_seen >= start && threat.last_seen <= end
    );
  }

  /**
   * Get recent threat intelligence
   */
  getRecentThreatIntel(limit: number = 100): ThreatIntel[] {
    const sorted = Array.from(this.threatIntel.values()).sort((a, b) => 
      b.last_seen - a.last_seen
    );
    return sorted.slice(0, limit);
  }

  /**
   * Check if indicator is known threat
   */
  isKnownThreat(indicator: string): boolean {
    return this.threatIntel.has(indicator);
  }

  /**
   * Get threat level for indicator
   */
  getThreatLevel(indicator: string): 'low' | 'medium' | 'high' | 'critical' | null {
    const threat = this.threatIntel.get(indicator);
    return threat ? threat.threat_level : null;
  }

  /**
   * Get confidence for indicator
   */
  getConfidence(indicator: string): number | null {
    const threat = this.threatIntel.get(indicator);
    return threat ? threat.confidence : null;
  }

  /**
   * Update threat intelligence
   */
  updateThreatIntel(
    indicator: string,
    updates: Partial<ThreatIntel>
  ): boolean {
    const threat = this.threatIntel.get(indicator);
    if (!threat) {
      return false;
    }

    Object.assign(threat, updates);
    threat.last_seen = Date.now();
    
    return true;
  }

  /**
   * Remove threat intelligence
   */
  removeThreatIntel(indicator: string): boolean {
    return this.threatIntel.delete(indicator);
  }

  /**
   * Clear all threat intelligence
   */
  clearThreatIntel(): void {
    this.threatIntel.clear();
  }

  /**
   * Clear old threat intelligence
   */
  clearOldThreatIntel(olderThan: number): number {
    const cutoff = Date.now() - olderThan;
    const initialCount = this.threatIntel.size;
    
    for (const [indicator, threat] of this.threatIntel.entries()) {
      if (threat.last_seen < cutoff) {
        this.threatIntel.delete(indicator);
      }
    }
    
    return initialCount - this.threatIntel.size;
  }

  /**
   * Get threat intelligence count
   */
  getThreatIntelCount(): number {
    return this.threatIntel.size;
  }

  /**
   * Get threat intelligence statistics
   */
  getThreatIntelStats(): {
    total: number;
    byLevel: Record<string, number>;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    byTag: Record<string, number>;
  } {
    const stats = {
      total: this.threatIntel.size,
      byLevel: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      byTag: {} as Record<string, number>
    };

    for (const threat of this.threatIntel.values()) {
      stats.byLevel[threat.threat_level] = (stats.byLevel[threat.threat_level] || 0) + 1;
      stats.byType[threat.type] = (stats.byType[threat.type] || 0) + 1;
      
      for (const source of threat.sources) {
        stats.bySource[source] = (stats.bySource[source] || 0) + 1;
      }
      
      for (const tag of threat.tags) {
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Export threat intelligence for debugging
   */
  exportThreatIntel(): string {
    return JSON.stringify(Array.from(this.threatIntel.values()), null, 2);
  }

  /**
   * Import threat intelligence from string
   */
  importThreatIntel(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.threatIntel.clear();
        for (const threat of imported) {
          if (threat.indicator) {
            this.threatIntel.set(threat.indicator, threat);
          }
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Search threat intelligence
   */
  searchThreatIntel(query: string): ThreatIntel[] {
    const results: ThreatIntel[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const threat of this.threatIntel.values()) {
      if (
        threat.indicator.toLowerCase().includes(lowerQuery) ||
        threat.description?.toLowerCase().includes(lowerQuery) ||
        threat.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        threat.sources.some(source => source.toLowerCase().includes(lowerQuery))
      ) {
        results.push(threat);
      }
    }
    
    return results;
  }
}
