/**
 * Media Sampling Service
 * Extracts short clips from video/audio for cost-effective DMCA checks.
 * Uses ffprobe for duration, ffmpeg for clip extraction.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLIP_LENGTH_SEC = 12;
const MIN_GAP_SEC = 5;
const MAX_CLIPS = 5;

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/ogg',
]);
const AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
]);

function isVideoOrAudio(mimeType: string): boolean {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return base.startsWith('video/') || base.startsWith('audio/') || VIDEO_MIMES.has(base) || AUDIO_MIMES.has(base);
}

function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
  };
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return map[base] || (base.startsWith('video/') ? 'mp4' : base.startsWith('audio/') ? 'm4a' : 'bin');
}

/**
 * Get duration in seconds using ffprobe. Returns 0 if unsupported or error.
 */
export async function getMediaDuration(buffer: Buffer, mimeType: string): Promise<number> {
  if (!isVideoOrAudio(mimeType)) return 0;

  const tmpPath = path.join(os.tmpdir(), `dmca-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.${getFileExtension(mimeType)}`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        tmpPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    });
    fs.unlinkSync(tmpPath);
    if (result.code !== 0) {
      console.warn('[MediaSampling] ffprobe failed:', result.stderr || result.stdout);
      return 0;
    }
    const dur = parseFloat(result.stdout.trim());
    return Number.isFinite(dur) && dur >= 0 ? dur : 0;
  } catch (err) {
    console.warn('[MediaSampling] getMediaDuration error:', (err as Error)?.message);
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    return 0;
  }
}

/**
 * Compute number of clips based on duration (plan formula).
 */
function getClipCount(durationSeconds: number): number {
  if (durationSeconds < 12) return 1;
  if (durationSeconds <= 120) return 1;
  if (durationSeconds <= 300) return 2;
  if (durationSeconds <= 900) return 3;
  if (durationSeconds <= 1800) return 4;
  return MAX_CLIPS;
}

/**
 * Pick N random start times with minimum gap between them.
 */
function pickRandomStarts(durationSeconds: number, n: number): number[] {
  const maxStart = Math.max(0, durationSeconds - CLIP_LENGTH_SEC);
  if (maxStart <= 0 || n <= 1) return [0];
  const starts: number[] = [];
  const attempts = 100;
  for (let i = 0; i < attempts && starts.length < n; i++) {
    const s = Math.random() * (maxStart + 1);
    const tooClose = starts.some((t) => Math.abs(t - s) < MIN_GAP_SEC);
    if (!tooClose) starts.push(s);
  }
  if (starts.length < n) {
    for (let k = starts.length; k < n && starts.length < 20; k++) {
      const s = (k / (n + 1)) * maxStart;
      if (!starts.includes(s)) starts.push(s);
    }
  }
  return starts.slice(0, n).sort((a, b) => a - b);
}

/**
 * Extract clips from media. Returns array of buffers.
 * For duration < 12 sec, returns [fullBuffer].
 * Uses temp file + ffmpeg for extraction.
 */
export async function extractRandomClips(buffer: Buffer, mimeType: string, durationSeconds: number): Promise<Buffer[]> {
  if (!isVideoOrAudio(mimeType)) return [];

  const ext = getFileExtension(mimeType);
  const tmpPath = path.join(os.tmpdir(), `dmca-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

  try {
    fs.writeFileSync(tmpPath, buffer);

    if (durationSeconds < 12) {
      const single = await extractSegment(tmpPath, 0, durationSeconds, mimeType);
      return single ? [single] : [buffer];
    }

    const n = getClipCount(durationSeconds);
    const starts = pickRandomStarts(durationSeconds, n);
    const clips: Buffer[] = [];

    for (const start of starts) {
      const clip = await extractSegment(tmpPath, start, CLIP_LENGTH_SEC, mimeType);
      if (clip) clips.push(clip);
    }

    return clips.length > 0 ? clips : [buffer.slice(0, Math.min(buffer.length, 5 * 1024 * 1024))];
  } catch (err) {
    console.warn('[MediaSampling] extractRandomClips error:', (err as Error)?.message);
    return [];
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function extractSegment(inputPath: string, startSec: number, durationSec: number, mimeType: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const isAudio = mimeType.toLowerCase().startsWith('audio/');
    const args = isAudio
      ? ['-ss', String(startSec), '-i', inputPath, '-t', String(durationSec), '-vn', '-acodec', 'libmp3lame', '-f', 'mp3', 'pipe:1']
      : ['-ss', String(startSec), '-i', inputPath, '-t', String(durationSec), '-f', 'mp4', '-c', 'copy', '-movflags', 'frag_keyframe+empty_moov+default_base_moov', 'pipe:1'];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (d) => chunks.push(d));
    proc.stderr?.on('data', () => { /* ffmpeg writes progress to stderr */ });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        resolve(null);
      }
    });
  });
}
