import { API_ENDPOINT } from '../config/api';

const ENABLED = String(import.meta.env.VITE_ENABLE_QUERYABLE_ERROR_INGESTION || '').toLowerCase() === 'true';
const ERROR_ENDPOINT = String(import.meta.env.VITE_QUERYABLE_ERROR_ENDPOINT || '').trim();

export type IngestedErrorRow = {
  service: string;
  level: string;
  message: string;
  timestamp: string;
};

export async function loadQueryableErrors(): Promise<{ enabled: boolean; rows: IngestedErrorRow[]; error?: string }> {
  if (!ENABLED || !ERROR_ENDPOINT) {
    return { enabled: false, rows: [] };
  }
  try {
    const res = await fetch(`${API_ENDPOINT}${ERROR_ENDPOINT}`, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      return { enabled: true, rows: [], error: `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.errors) ? data.errors : [];
    const mapped: IngestedErrorRow[] = rows.map((r: any) => ({
      service: String(r.service ?? 'api'),
      level: String(r.level ?? 'error'),
      message: String(r.message ?? ''),
      timestamp: String(r.timestamp ?? r.created_at ?? '')
    }));
    return { enabled: true, rows: mapped };
  } catch (e) {
    return { enabled: true, rows: [], error: e instanceof Error ? e.message : 'network_error' };
  }
}
