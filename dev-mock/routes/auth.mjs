import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import {
  normalizeEmail,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '../../web/js/core/validators.js';
import { burnPasswordCheck, clientIp, sendError, verifyPassword } from '../security.mjs';
import { isoTime } from '../store.mjs';
import { fieldErrors, jsonBody, toUser, validationFailed } from './common.mjs';

export function authRoutes(ctx) {
  const { store, sessions, csrf, lockout, limiters, outbox, settings } = ctx;
  const router = Router();

  const tooManyAttempts = (res, seconds) =>
    sendError(res, 429, 'auth.too_many_attempts', { retryAfterSeconds: seconds });

  router.get('/csrf', (req, res) => {
    res.json({ token: csrf.issue(req, res) });
  });

  router.get('/me', (req, res) => {
    if (!req.user) return sendError(res, 401, 'auth.unauthenticated');
    res.json(toUser(req.user));
  });

  router.post('/auth/register', async (req, res) => {
    const { displayName, email, password } = jsonBody(req);
    const fields = fieldErrors({
      displayName: validateDisplayName(displayName),
      email: validateEmail(email),
      password: validatePassword(password),
    });
    if (fields) return validationFailed(res, fields);
    if (store.findUserByEmail(email)) return sendError(res, 409, 'auth.email_taken');

    await store.createUser({ email, displayName: displayName.trim(), password });
    res.status(201).json({});
  });

  router.post('/auth/login', async (req, res) => {
    const ipWait = limiters.login.hit(clientIp(req));
    if (ipWait !== null) return tooManyAttempts(res, ipWait);

    const { email, password } = jsonBody(req);
    const fields = fieldErrors({
      email: typeof email === 'string' && email.trim() !== '' ? null : 'required',
      password: typeof password === 'string' && password !== '' ? null : 'required',
    });
    if (fields) return validationFailed(res, fields);

    const key = normalizeEmail(email);
    const lockedFor = lockout.lockedFor(key);
    if (lockedFor !== null) return tooManyAttempts(res, lockedFor);

    const user = store.findUserByEmail(key);
    const valid = user
      ? await verifyPassword(password, user.password)
      : await burnPasswordCheck(password);
    if (!valid) {
      const lockStarted = lockout.recordFailure(key);
      if (lockStarted !== null) return tooManyAttempts(res, lockStarted);
      return sendError(res, 401, 'auth.invalid_credentials');
    }

    lockout.reset(key);
    // A fresh session id on every sign-in prevents session fixation.
    sessions.destroy(req.sessionId);
    sessions.writeCookie(req, res, sessions.create(user.id));
    csrf.rotate(req, res);
    res.json({ user: toUser(user) });
  });

  router.post('/auth/logout', (req, res) => {
    sessions.destroy(req.sessionId);
    sessions.clearCookie(req, res);
    csrf.rotate(req, res);
    res.status(204).end();
  });

  router.post('/auth/forgot-password', (req, res) => {
    const wait = limiters.forgotPassword.hit(clientIp(req));
    if (wait !== null) return sendError(res, 429, 'rate.limited', { retryAfterSeconds: wait });

    const { email } = jsonBody(req);
    const user = typeof email === 'string' ? store.findUserByEmail(email) : null;
    if (user) {
      const token = randomBytes(32).toString('base64url');
      store.addResetToken(user.id, token, Date.now() + settings.resetTokenTtlMs);
      const query = new URLSearchParams({ email: user.email, token });
      outbox.push({
        to: user.email,
        kind: 'password-reset',
        link: `/reset-password.html?${query}`,
        createdAt: isoTime(),
      });
    }
    res.status(202).end();
  });

  router.post('/auth/reset-password', async (req, res) => {
    const { email, token, newPassword } = jsonBody(req);
    const fields = fieldErrors({ newPassword: validatePassword(newPassword) });
    if (fields) return validationFailed(res, fields);

    const user = typeof email === 'string' ? store.findUserByEmail(email) : null;
    if (!user || typeof token !== 'string' || !store.consumeResetToken(user.id, token)) {
      return sendError(res, 400, 'auth.reset_token_invalid');
    }
    await store.setPassword(user.id, newPassword);
    sessions.destroyForUser(user.id);
    res.status(204).end();
  });

  return router;
}
