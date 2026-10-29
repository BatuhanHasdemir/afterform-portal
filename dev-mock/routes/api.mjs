import express, { Router } from 'express';
import { SESSION_COOKIE, parseCookies, sendError } from '../security.mjs';
import { adminRoutes } from './admin.mjs';
import { authRoutes } from './auth.mjs';
import { demoRoutes } from './demos.mjs';

export function apiRoutes(ctx) {
  const { store, sessions, csrf, settings } = ctx;
  const router = Router();

  router.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    const sessionId = req.cookies.get(SESSION_COOKIE);
    const session = sessions.resolve(sessionId);
    const user = session ? store.getUser(session.userId) : null;
    if (user) {
      req.sessionId = sessionId;
      req.user = user;
    }
    next();
  });

  // Checked before any body is read, so a forged request never reaches parsing or uploads.
  router.use(csrf.middleware());
  router.use(express.json({ limit: settings.jsonBodyLimit, type: 'application/json' }));

  router.use(authRoutes(ctx));
  router.use(demoRoutes(ctx));
  router.use(adminRoutes(ctx));

  router.use((req, res) => sendError(res, 404, 'not_found'));
  return router;
}
