/**
 * A Drive write the device already finished. The API stores this receipt.
 * It does not open the user's cloud.
 */

import type { Request, Response } from 'express';

export function readDeviceCloudResult(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { deviceCloudResult?: unknown }).deviceCloudResult;
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
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
