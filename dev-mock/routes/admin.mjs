import { Router } from 'express';
import { validateStatus, validateStatusNote } from '../../web/js/core/validators.js';
import { sendError } from '../security.mjs';
import {
  fieldErrors,
  jsonBody,
  parseListQuery,
  requireAuth,
  requireRole,
  toAdminDemo,
  validationFailed,
} from './common.mjs';

export function adminRoutes(ctx) {
  const { store } = ctx;
  const router = Router();

  router.use('/admin', requireAuth, requireRole('admin'));

  router.get('/admin/demos', (req, res) => {
    const { fields, value } = parseListQuery(req.query, { allowSearch: true });
    if (fields) return validationFailed(res, fields);
    const page = store.listDemos(value);
    res.json({
      ...page,
      items: page.items.map((demo) => toAdminDemo(demo, store.getUser(demo.ownerId))),
    });
  });

  router.get('/admin/demos/:id', (req, res) => {
    const demo = store.getDemo(req.params.id);
    if (!demo) return sendError(res, 404, 'demo.not_found');
    res.json(toAdminDemo(demo, store.getUser(demo.ownerId)));
  });

  router.patch('/admin/demos/:id/status', (req, res) => {
    const { status, statusNote } = jsonBody(req);
    const fields = fieldErrors({
      status: validateStatus(status),
      statusNote: validateStatusNote(statusNote),
    });
    if (fields) return validationFailed(res, fields);

    // A note belongs to the decision it explains; without a new one the old note is dropped.
    const note = typeof statusNote === 'string' && statusNote.trim() !== '' ? statusNote.trim() : null;
    const demo = store.updateDemoStatus(req.params.id, status, note);
    if (!demo) return sendError(res, 404, 'demo.not_found');
    res.json(toAdminDemo(demo, store.getUser(demo.ownerId)));
  });

  return router;
}
