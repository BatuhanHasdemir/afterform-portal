import { Router } from 'express';
import { sendError } from '../security.mjs';

// Development helpers, outside the API contract; the real backend has no equivalent.
export function devRoutes(ctx) {
  const router = Router();

  router.post('/reset', sameOriginOnly, async (req, res) => {
    await ctx.reset();
    res.status(204).end();
  });

  router.get('/outbox', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ items: ctx.outbox });
  });

  return router;
}

// /dev/reset has no CSRF token; refusing foreign origins stops another site from wiping the data.
function sameOriginOnly(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    return sendError(res, 403, 'auth.forbidden');
  }
  next();
}
