import { registerPlugin } from '@capacitor/core';

export type OpenExternalAppPlugin = {
  open(options: { url: string }): Promise<void>;
};

/** Native UIApplication.open / Android ACTION_VIEW — not Cap App (no openUrl on iOS). */
export const OpenExternalApp = registerPlugin<OpenExternalAppPlugin>('OpenExternalApp');
