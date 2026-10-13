/** Wrap ready controller state (keys validated by controllerReadyState.gate.test.ts). */
export function penControllerReady<const T extends { phase: 'ready' }>(state: T): T {
  return state;
}
