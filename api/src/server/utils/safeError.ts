/**
 * Safe error message for API responses.
 * In production, clients receive a generic message to avoid leaking paths, env vars, or stack.
 * In development, the actual error message is returned for debugging.
 */
export function safeClientErrorMessage(error: unknown, isProduction: boolean): string | undefined {
  if (isProduction) {
    return 'An error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return error != null ? String(error) : undefined;
}
