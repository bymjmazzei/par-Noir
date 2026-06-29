/**
 * Messaging route logging — hashes pN identifiers via safeLogger; verbose traces gated.
 */

import { isDevVerbose, safeLogger, isMessagingDebugLogs } from '../../utils/logger';

export function isMessagingDebugLogsEnabled(): boolean {
  return isMessagingDebugLogs();
}

function shouldVerbose(): boolean {
  return isMessagingDebugLogsEnabled() || isDevVerbose();
}

export const messagingLog = {
  /** High-signal events (production-safe; meta sanitized + pn ids hashed). */
  info: (message: string, meta?: Record<string, unknown>) => {
    safeLogger.info(message, { ...meta, category: 'messaging' });
  },
  /** Sheet/folder tracing — only when MESSAGING_DEBUG_LOGS or non-production verbose. */
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (shouldVerbose()) {
      safeLogger.info(message, { ...meta, category: 'messaging', verbose: true });
    }
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    safeLogger.warn(message, { ...meta, category: 'messaging' });
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    safeLogger.error(message, { ...meta, category: 'messaging' });
  },
};
