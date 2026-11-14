import { createSuggestionsService } from './services/suggestions.service.js';
import { createSuggestionsRepository } from './repositories/suggestions.repository.js';
import { createMailer } from './services/mail.service.js';
import { createPasswordResetService } from './services/password-reset.service.js';
import { createEmailWorker, startEmailWorker } from './services/email-worker.js';
import { createChatRepository } from './repositories/chat.repository.js';
import { createChatService } from './services/chat.service.js';
import { attachChatSocket } from './chat-socket.js';
import { createMatchingRepository } from './repositories/matching.repository.js';
import { createLookupRepository } from './repositories/lookup.repository.js';
import { createLookupService } from './services/lookup.service.js';
import { createMatchingService } from './services/matching.service.js';
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
import { createClaimRepository } from './repositories/claim.repository.js';
import { createClaimService } from './services/claim.service.js';
import { createNotificationRepository } from './repositories/notification.repository.js';
import { createNotificationService } from './services/notification.service.js';
import { createReportRepository } from './repositories/report.repository.js';
import { createReportService } from './services/report.service.js';
import { createAdminRepository } from './repositories/admin.repository.js';
import { createAdminService } from './services/admin.service.js';
import { createVisualSuggestionsRepository } from './repositories/visual-suggestions.repository.js';
import { createVisualSuggestionsService } from './services/visual-suggestions.service.js';
import { createImageStorage } from './config/cloudinary.js';
import { createImageOperations, startImageCleanup } from './services/image-operations.js';
import { assertIsolatedInstance } from '../database/scripts/assert-isolated.js';
import { assertAiVisualSchema } from './ai-visual/schema-check.js';

export async function startServer(config = readConfig()) {
  if ((config.aiVisual?.enabled || config.aiVisualSuggestions?.enabled) && !config.aiVisual?.production) await assertIsolatedInstance();
  const authConfig = readAuthConfig({ JWT_SECRET: config.auth?.secret, JWT_EXPIRES_IN: config.auth?.expiresIn });
  const imageStorage = createImageStorage();
  const pool = createDbPool(config.database);
  const healthService = createHealthService(createHealthRepository(pool, config.health));
  const users = createUserRepository(pool);
  const authService = createAuthService(users, createTokenService(authConfig));
  const userService = createUserService(users);
  const matchingService = createMatchingService(createMatchingRepository(pool));
  const itemRepository = createItemRepository(pool);
  const lookupService = createLookupService(createLookupRepository(pool));
  const imageOperations = createImageOperations(pool, imageStorage);
  const itemService = createItemService(itemRepository, imageStorage, imageOperations, config.aiVisual);
  const claimService = createClaimService(createClaimRepository(pool));
  const notificationService = createNotificationService(createNotificationRepository(pool));
  const reportService = createReportService(createReportRepository(pool));
  const adminService = createAdminService(createAdminRepository(pool), itemService);
  const visualSuggestionsService = createVisualSuggestionsService(
    createVisualSuggestionsRepository(pool), { ...config.aiVisualSuggestions, production: config.aiVisual?.production }
  );
  const mailer = createMailer();
  const chatService = createChatService(createChatRepository(pool));
  let io;
  const passwordResetService = createPasswordResetService(pool, mailer, id => {
    for (const socket of io?.sockets.sockets.values() ?? []) if (socket.data.identity.id === id) socket.disconnect(true);
  });
  let server;
  try {
    if (config.aiVisual?.enabled || config.aiVisualSuggestions?.enabled) await assertAiVisualSchema(pool);
    await healthService.check({ fresh: true });
    console.log('MySQL connection verified: findit_db');
    server = createServer(createApp({ suggestionsService: createSuggestionsService(createSuggestionsRepository(pool, { visualEnabled: config.aiVisualSuggestions.enabled, production: config.aiVisualSuggestions.production })), healthService, authService, userService, itemService, matchingService, claimService, notificationService, reportService, adminService, lookupService, visualSuggestionsService, chatService, passwordResetService, corsOrigins: config.corsOrigins, security: config.security }));
    io = attachChatSocket(server, { authService, chatService, corsOrigins: config.corsOrigins });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) {
    if (server?.listening) server.close();
    chatService.close();
    io?.close();
    mailer.close();
    await pool.end();
    throw error;
  }
  console.log(`FindIT backend listening at http://${config.host}:${server.address().port}`);
  const stopCleanup = imageStorage ? startImageCleanup(imageOperations) : async () => {};
  const stopEmail = startEmailWorker(createEmailWorker(pool, mailer));
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
        io.disconnectSockets(true);
        io.close();
        chatService.close();
        await stopEmail();
        mailer.close();
        await new Promise((resolve, reject) => server.close((error) => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
        await stopCleanup();
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
