/** Vite dev flag; mock in Jest via `jest.mock('../utils/isDev')`. */
export function isDev(): boolean {
  return import.meta.env.DEV;
}
