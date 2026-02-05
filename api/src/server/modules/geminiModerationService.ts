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

      const prompt = `Analyze this content for DMCA/copyright risk. Flag if copyrighted music, video, images, or text is detectable at any level—including background or incidental use (e.g. music playing while someone talks). Do not distinguish between primary and incidental use. Only allow content with no recognizable copyrighted material, original/creator-owned content, or properly licensed content. Return JSON only: {"flagged": boolean, "reason": string, "confidence": number (0-1)}. If content appears to be original, user-created, or properly licensed, set flagged to false.`;

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

  /**
   * Check multiple sampled clips in one request (cost-effective for long media).
   * If ANY clip appears to violate, returns flagged: true.
   */
  async checkDMCASampled(clips: { buffer: Buffer; mimeType: string }[]): Promise<DMCACheckResult> {
    if (!this.isInitialized || !this.genAI || !clips.length) {
      if (!clips.length) {
        console.warn('⚠️ [GeminiModerationService] No clips to check; allowing content');
      } else {
        console.warn('⚠️ [GeminiModerationService] Service not initialized; allowing content');
      }
      return { flagged: false, confidence: 0 };
    }

    try {
      const parts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];
      for (const clip of clips) {
        const base64 = clip.buffer.toString('base64');
        parts.push({ inlineData: { data: base64, mimeType: clip.mimeType } });
      }
      const prompt = `These are ${clips.length} clips sampled from the same file. Analyze each for DMCA/copyright risk. Flag if copyrighted music, video, images, or text is detectable at any level—including background or incidental use. Do not distinguish between primary and incidental use. Only allow if no recognizable copyrighted material, original/creator-owned content, or properly licensed content. If ANY clip appears to violate, return flagged: true. Return JSON only: {"flagged": boolean, "reason": string, "confidence": number (0-1)}.`;
      parts.push({ text: prompt });

      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(parts);
      const responseText = result.response.text();
      const response = this.parseJSONResponse(responseText);

      return {
        flagged: response.flagged === true,
        reason: typeof response.reason === 'string' ? response.reason : undefined,
        confidence: typeof response.confidence === 'number' ? response.confidence : 0.8,
      };
    } catch (error) {
      console.error('❌ [GeminiModerationService] DMCA sampled check error:', error);
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
