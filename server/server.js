import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { createDbPool } from './config/db.js';
import { createHealthRepository } from './repositories/health.repository.js';
import { createHealthService } from './services/health.service.js';
import { logError } from './utils/logger.js';
import { readAuthConfig } from './config/env.js';
import { createTokenService } from './utils/jwt.js';
import { createUserRepository } from './repositories/user.repository.js';
import { createAuthService } from './services/auth.service.js';
import { createUserService } from './services/user.service.js';
import { createItemRepository } from './repositories/item.repository.js';
import { createItemService } from './services/item.service.js';
import { createImageStorage } from './config/cloudinary.js';

export async function startServer(config = readConfig()) {
  const authConfig = readAuthConfig({ JWT_SECRET: config.auth?.secret, JWT_EXPIRES_IN: config.auth?.expiresIn });
  const imageStorage = createImageStorage();
  const pool = createDbPool(config.database);
  const healthService = createHealthService(createHealthRepository(pool));
  const users = createUserRepository(pool);
  const authService = createAuthService(users, createTokenService(authConfig));
  const userService = createUserService(users);
  const itemRepository = createItemRepository(pool);
  const itemService = createItemService(itemRepository, imageStorage);
  let server;
  try {
    await healthService.check();
    console.log('MySQL connection verified: findit_db');
    server = createServer(createApp({ healthService, authService, userService, itemService, corsOrigins: config.corsOrigins }));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) {
    if (server?.listening) server.close();
    await pool.end();
    throw error;
  }
  console.log(`FindIT backend listening at http://${config.host}:${server.address().port}`);
  let closing;
  function close() {
    if (closing) return closing;
    closing = (async () => {
      const deadline = setTimeout(() => {
        logError('shutdown_timeout', { code: 'SHUTDOWN_TIMEOUT' });
        server.closeAllConnections();
        process.exit(1);
      }, 10000);
      deadline.unref();
      try {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await pool.end();
      } finally { clearTimeout(deadline); }
    })();
    return closing;
  }
  return { server, pool, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const runtime = await startServer();
    const shutdown = () => runtime.close().catch((error) => { logError('shutdown_failed', error); process.exitCode = 1; });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    runtime.server.on('error', (error) => { logError('http_server_failed', error); shutdown(); });
  } catch (error) { logError('startup_failed', error); process.exitCode = 1; }
}
