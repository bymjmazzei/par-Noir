/**
 * A cloud write the device already finished. The API stores this receipt.
 * It does not open the user's cloud.
 */

import type { Request, Response } from 'express';

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/**
 * A receipt names the provider written, or (older Google clients) the sheet.
 * Non-Google social clouds have no sheet id, so routes must not require one.
 */
export function readDeviceCloudResult(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { deviceCloudResult?: unknown }).deviceCloudResult;
  if (!raw || typeof raw !== 'object') return null;
  const receipt = raw as Record<string, unknown>;
  return text(receipt.provider) || text(receipt.spreadsheetId) ? receipt : null;
}

export function respondCloudOnDevice(res: Response): void {
  res.status(409).json({
    error: 'cloud_on_device',
    error_description: 'This write already ran on the device. Submit deviceCloudResult.',
  });
}

export function deviceCloudResultFromReq(req: Request): Record<string, unknown> | null {
  return readDeviceCloudResult(req.body);
}
