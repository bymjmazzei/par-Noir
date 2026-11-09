import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SW_FILE = 'pn-notify-sw.js';
const swSource = () => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'sw', SW_FILE), 'utf-8');

/** Serves /pn-notify-sw.js in dev and emits it at the build root (service workers need a stable URL). */
export function pnNotifyServiceWorker() {
  return {
    name: 'pn-notify-service-worker',
    configureServer(server) {
      server.middlewares.use(`/${SW_FILE}`, (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Service-Worker-Allowed', '/');
        res.end(swSource());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SW_FILE, source: swSource() });
    },
  };
}
