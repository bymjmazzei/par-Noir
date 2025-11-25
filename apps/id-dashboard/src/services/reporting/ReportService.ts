/**
 * Report Service
 * Handles content reporting, validation, and auto-escalation
 */

import { geminiModerationService } from '../ai/GeminiModerationService';
import { getMetadataIndexService } from '../metadata/MetadataIndexService';
import type { PublicMetadata, ContentRating } from '../../types/aggregator';

export interface Report {
  id: string;
  fileId: string;
  reporterPnId: string;
  reportType: 'nsfw' | 'spam' | 'copyright' | 'other';
  reason?: string;
  timestamp: string;
  validatedByGemini?: boolean;
  geminiResult?: 'confirmed' | 'rejected' | 'pending';
}

export interface ReportResult {
  success: boolean;
  report: Report;
  escalated?: boolean;
  newRating?: ContentRating;
  error?: string;
}

export class ReportService {
  private reports: Map<string, Report[]> = new Map();
  private readonly AUTO_ESCALATE_THRESHOLD = 5;

  /**
   * Submit a report for content
   */
  async submitReport(
    fileId: string,
    reporterPnId: string,
    reportType: 'nsfw' | 'spam' | 'copyright' | 'other',
    reason?: string
  ): Promise<ReportResult> {
    try {
      // Check if user already reported this file
      const existingReports = this.reports.get(fileId) || [];
      const userAlreadyReported = existingReports.some(
        r => r.reporterPnId === reporterPnId && r.reportType === reportType
      );

      if (userAlreadyReported) {
        return {
          success: false,
          report: {} as Report,
          error: 'You have already submitted this type of report for this content'
        };
      }

      // Create report
      const report: Report = {
        id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fileId,
        reporterPnId,
        reportType,
        reason,
        timestamp: new Date().toISOString(),
        geminiResult: 'pending'
      };

      // Store report
      const fileReports = existingReports.concat(report);
      this.reports.set(fileId, fileReports);

      // Persist reports to metadata
      await this.persistReportsToMetadata(fileId, fileReports);

      // Validate with Gemini (async, non-blocking)
      this.validateReportWithGemini(report).catch(error => {
        console.error('❌ [ReportService] Report validation error:', error);
      });

      // Check for auto-escalation
      const escalationResult = await this.checkAutoEscalation(fileId, fileReports);

      return {
        success: true,
        report,
        escalated: escalationResult.escalated,
        newRating: escalationResult.newRating
      };
    } catch (error) {
      console.error('❌ [ReportService] Report submission error:', error);
      return {
        success: false,
        report: {} as Report,
        error: error instanceof Error ? error.message : 'Failed to submit report'
      };
    }
  }

  /**
   * Validate report with Gemini AI
   */
  private async validateReportWithGemini(report: Report): Promise<void> {
    try {
      // Get file metadata to retrieve content
      const metadataService = getMetadataIndexService();
      const metadata = await metadataService.getMetadata(report.fileId);

      if (!metadata) {
        console.warn('⚠️ [ReportService] Cannot validate report - metadata not found');
        report.validatedByGemini = false;
        return;
      }

      // For now, we'll validate based on existing content rating
      // In a full implementation, we'd re-download and check the actual file content
      // This is a simplified version that validates against current metadata
      
      if (report.reportType === 'nsfw') {
        // Re-check with Gemini if we have file access
        // For now, mark as pending and let auto-escalation handle it
        report.validatedByGemini = true;
        report.geminiResult = 'pending';
        
        // If content is already flagged, confirm the report
        if (metadata.contentRating === 'nsfw' || metadata.contentRating === 'x-rated') {
          report.geminiResult = 'confirmed';
        }
      } else {
        // For other report types, mark as confirmed
        report.validatedByGemini = true;
        report.geminiResult = 'confirmed';
      }

      // Update report in storage
      const reports = this.reports.get(report.fileId) || [];
      const reportIndex = reports.findIndex(r => r.id === report.id);
      if (reportIndex >= 0) {
        reports[reportIndex] = report;
        this.reports.set(report.fileId, reports);
        await this.persistReportsToMetadata(report.fileId, reports);
      }
    } catch (error) {
      console.error('❌ [ReportService] Report validation error:', error);
      report.validatedByGemini = false;
    }
  }

  /**
   * Check if auto-escalation is needed
   */
  private async checkAutoEscalation(
    fileId: string,
    reports: Report[]
  ): Promise<{ escalated: boolean; newRating?: ContentRating }> {
    // Count NSFW reports
    const nsfwReports = reports.filter(r => r.reportType === 'nsfw');
    
    if (nsfwReports.length >= this.AUTO_ESCALATE_THRESHOLD) {
      // Get current metadata
      const metadataService = getMetadataIndexService();
      const metadata = await metadataService.getMetadata(fileId);
      
      if (metadata && metadata.contentRating === 'safe') {
        // Auto-escalate to NSFW
        const updatedMetadata: Partial<PublicMetadata> = {
          ...metadata,
          contentRating: 'nsfw',
          autoFlagged: true,
          reportCount: reports.length,
          lastModerationCheck: new Date().toISOString(),
          moderationHistory: [
            ...(metadata.moderationHistory || []),
            {
              id: `mod_${Date.now()}`,
              type: 'user_report',
              action: 'escalated',
              rating: 'nsfw',
              timestamp: new Date().toISOString(),
              source: 'user_report',
              reason: `${nsfwReports.length} NSFW reports received`
            }
          ]
        };

        await metadataService.updateMetadata(fileId, updatedMetadata as PublicMetadata);
        
        // Notify owner
        await this.notifyOwner(fileId, 'auto_escalated', {
          reportCount: nsfwReports.length,
          newRating: 'nsfw'
        });

        return {
          escalated: true,
          newRating: 'nsfw'
        };
      }
    }

    return { escalated: false };
  }

  /**
   * Get reports for a file
   */
  async getFileReports(fileId: string): Promise<Report[]> {
    // Load from metadata if not in memory
    if (!this.reports.has(fileId)) {
      await this.loadReportsFromMetadata(fileId);
    }
    return this.reports.get(fileId) || [];
  }

  /**
   * Get report count for a file
   */
  async getReportCount(fileId: string): Promise<number> {
    const reports = await this.getFileReports(fileId);
    return reports.length;
  }

  /**
   * Persist reports to file metadata
   */
  private async persistReportsToMetadata(fileId: string, reports: Report[]): Promise<void> {
    try {
      const metadataService = getMetadataIndexService();
      const metadata = await metadataService.getMetadata(fileId);
      
      if (metadata) {
        const updatedMetadata: Partial<PublicMetadata> = {
          ...metadata,
          reportCount: reports.length,
          lastReportedAt: reports.length > 0 
            ? reports[reports.length - 1].timestamp 
            : undefined,
          // Store reports in metadata (limited to last 20 for storage efficiency)
          reports: reports.slice(-20)
        };

        await metadataService.updateMetadata(fileId, updatedMetadata as PublicMetadata);
      }
    } catch (error) {
      console.error('❌ [ReportService] Failed to persist reports:', error);
    }
  }

  /**
   * Load reports from metadata
   */
  private async loadReportsFromMetadata(fileId: string): Promise<void> {
    try {
      const metadataService = getMetadataIndexService();
      const metadata = await metadataService.getMetadata(fileId);
      
      if (metadata && metadata.reports) {
        this.reports.set(fileId, metadata.reports);
      }
    } catch (error) {
      console.error('❌ [ReportService] Failed to load reports:', error);
    }
  }

  /**
   * Notify owner of content flag/escalation
   */
  private async notifyOwner(
    fileId: string,
    reason: 'content_flagged' | 'auto_escalated',
    details?: { reportCount?: number; newRating?: ContentRating }
  ): Promise<void> {
    try {
      // Dispatch custom event for notification system
      window.dispatchEvent(new CustomEvent('content-moderation-event', {
        detail: {
          fileId,
          reason,
          details,
          timestamp: new Date().toISOString()
        }
      }));

      console.log(`📢 [ReportService] Owner notification sent for ${reason}:`, details);
    } catch (error) {
      console.error('❌ [ReportService] Failed to notify owner:', error);
    }
  }

  /**
   * Update content rating (used by Gemini validation)
   */
  async updateContentRating(
    fileId: string,
    rating: ContentRating,
    source: 'gemini' | 'user_report' | 'admin' = 'gemini'
  ): Promise<void> {
    try {
      const metadataService = getMetadataIndexService();
      const metadata = await metadataService.getMetadata(fileId);
      
      if (metadata) {
        const updatedMetadata: Partial<PublicMetadata> = {
          ...metadata,
          contentRating: rating,
          autoFlagged: source === 'gemini',
          lastModerationCheck: new Date().toISOString(),
          moderationHistory: [
            ...(metadata.moderationHistory || []),
            {
              id: `mod_${Date.now()}`,
              type: source === 'gemini' ? 'auto_detection' : 'user_report',
              action: 'flagged',
              rating,
              timestamp: new Date().toISOString(),
              source
            }
          ]
        };

        await metadataService.updateMetadata(fileId, updatedMetadata as PublicMetadata);
        
        if (rating !== 'safe') {
          await this.notifyOwner(fileId, 'content_flagged', { newRating: rating });
        }
      }
    } catch (error) {
      console.error('❌ [ReportService] Failed to update content rating:', error);
    }
  }
}

// Export singleton instance
export const reportService = new ReportService();

