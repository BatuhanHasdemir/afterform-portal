import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { apiRoutes } from './routes/api.mjs';
import { devRoutes } from './routes/dev.mjs';
import {
  CsrfProtection,
  FixedWindowLimiter,
  LoginLockout,
  SessionStore,
  securityHeaders,
  sendError,
} from './security.mjs';
import { SETTINGS } from './settings.mjs';
import { Store } from './store.mjs';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('./.data/', import.meta.url));

const BODY_ERRORS = new Set([
  'entity.parse.failed',
  'entity.too.large',
  'encoding.unsupported',
  'charset.unsupported',
]);

export async function createApp({
  dataDir = DATA_DIR,
  webDir = WEB_DIR,
  maxUploadBytes = SETTINGS.maxUploadBytes,
} = {}) {
  const store = new Store({ dataDir });
  await store.init();

  const ctx = {
    store,
    settings: SETTINGS,
    maxUploadBytes,
    sessions: new SessionStore({ idleMs: SETTINGS.sessionIdleMs }),
    csrf: new CsrfProtection(),
    lockout: new LoginLockout(SETTINGS.loginLockout),
    limiters: {
      login: new FixedWindowLimiter(SETTINGS.loginRateLimit),
      forgotPassword: new FixedWindowLimiter(SETTINGS.forgotPasswordRateLimit),
    },
    outbox: [],
    reset: async () => {
      await store.reset();
      ctx.sessions.clear();
      ctx.lockout.clear();
      ctx.limiters.login.clear();
      ctx.limiters.forgotPassword.clear();
      ctx.outbox.length = 0;
    },
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(securityHeaders);
  app.use('/api', apiRoutes(ctx));
  app.use('/dev', devRoutes(ctx));
  app.use(
    express.static(webDir, {
      index: 'index.html',
      setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
    }),
  );
  app.use((req, res) => {
    if (existsSync(join(webDir, '404.html'))) {
      return res.status(404).sendFile('404.html', { root: webDir });
    }
    res.status(404).type('text/plain').send('Not found');
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (BODY_ERRORS.has(error.type)) return sendError(res, 400, 'validation.failed');
    console.error(error);
    sendError(res, 500, 'server.error');
  });

  return { app, ctx };
}

export async function startServer({ port = SETTINGS.port, host = SETTINGS.host, ...options } = {}) {
  const { app, ctx } = await createApp(options);
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const { port: actualPort } = server.address();
  const shownHost = host.includes(':') ? `[${host}]` : host;
  return {
    server,
    ctx,
    url: `http://${shownHost}:${actualPort}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || SETTINGS.port;
  try {
    const { url } = await startServer({ port });
    console.log(`AFTER/FORM mock server: ${url}`);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    console.error(`Port ${port} is already in use. Stop the other process or set PORT.`);
    process.exitCode = 1;
  }
}
