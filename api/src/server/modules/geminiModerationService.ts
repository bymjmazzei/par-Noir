/**
 * API-side Gemini Moderation Service
 * DMCA-focused content check for private→indexed gating
 * Uses GEMINI_API_KEY env var
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface DMCACheckResult {
  flagged: boolean;
  reason?: string;
  confidence: number;
}

export class GeminiModerationService {
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string;
  private isInitialized: boolean = false;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ [GeminiModerationService] GEMINI_API_KEY not set; DMCA check will fail open');
      return;
    }
    try {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ [GeminiModerationService] Failed to initialize:', error);
    }
  }

  /**
   * Check content for DMCA/copyright risk
   * Returns flagged=true if content appears to be unauthorized copyrighted material
   */
  async checkDMCA(content: Buffer | Blob, mimeType: string): Promise<DMCACheckResult> {
    if (!this.isInitialized || !this.genAI) {
      console.warn('⚠️ [GeminiModerationService] Service not initialized; allowing content');
      return { flagged: false, confidence: 0 };
    }

    try {
      const base64 = await this.toBase64(content);
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `Analyze this content for DMCA/copyright risk. 
Check for: unauthorized use of copyrighted music, video, images, or text (e.g. commercial recordings, movie clips, TV shows, branded content used without permission, pirated material).
Return JSON only: {"flagged": boolean, "reason": string, "confidence": number (0-1)}
If content appears to be original, user-created, or properly licensed, set flagged to false.`;

      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType } },
        { text: prompt },
      ]);

      const responseText = result.response.text();
      const response = this.parseJSONResponse(responseText);

      return {
        flagged: response.flagged === true,
        reason: typeof response.reason === 'string' ? response.reason : undefined,
        confidence: typeof response.confidence === 'number' ? response.confidence : 0.8,
      };
    } catch (error) {
      console.error('❌ [GeminiModerationService] DMCA check error:', error);
      return { flagged: false, confidence: 0, reason: 'Check unavailable' };
    }
  }

  private async toBase64(content: Buffer | Blob): Promise<string> {
    if (Buffer.isBuffer(content)) {
      return content.toString('base64');
    }
    const arrayBuffer = await content.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  }

  private parseJSONResponse(text: string): Record<string, unknown> {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return { flagged: false, confidence: 0 };
    }
  }
}

let instance: GeminiModerationService | null = null;

export function getGeminiModerationService(): GeminiModerationService {
  if (!instance) {
    instance = new GeminiModerationService();
  }
  return instance;
}
