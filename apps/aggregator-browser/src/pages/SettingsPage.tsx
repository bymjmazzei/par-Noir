/**
 * Settings page - SettingsPanel overlay.
 */

import React from 'react';
import { SettingsPanel } from '../components/SettingsPanel';

export interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  return <SettingsPanel onClose={onClose} />;
}
