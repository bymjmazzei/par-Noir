import { createServer } from 'node:http';
import type { RelayBackend } from './backend.js';
import { createFtpsBackend } from './backends/ftps.js';
import { createSftpBackend } from './backends/sftp.js';
import { ConfigError, loadConfig } from './config.js';
import { createRelayHandler } from './relay.js';

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[relay] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const backend: RelayBackend =
    config.backend.protocol === 'sftp' ? createSftpBackend(config.backend) : createFtpsBackend(config.backend);
  const server = createServer(createRelayHandler(config, backend));

  server.listen(config.port, () => {
    console.log(
      `[relay] listening on ${config.port}; ${config.backend.protocol} ${config.backend.host}:${config.backend.port}, prefix ${config.prefix}`
    );
  });

  const shutdown = () => {
    server.close(() => void backend.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
