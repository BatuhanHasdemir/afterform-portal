import { PAGINATION, SORT_ORDERS, STATUSES } from '../../web/js/core/config.js';
import { sendError } from '../security.mjs';

export function requireAuth(req, res, next) {
  if (!req.user) return sendError(res, 401, 'auth.unauthenticated');
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return sendError(res, 403, 'auth.forbidden');
    next();
  };
}

export function jsonBody(req) {
  const body = req.body;
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

// { field: code | null } -> { field: [code] } for the failing ones only.
export function fieldErrors(checks) {
  const fields = {};
  for (const [name, code] of Object.entries(checks)) {
    if (code) fields[name] = [code];
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

export function validationFailed(res, fields) {
  sendError(res, 400, 'validation.failed', fields ? { fields } : {});
}

export function parseListQuery(query, { allowSearch = false } = {}) {
  const checks = {};
  const read = (name) => {
    const value = query[name];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string') {
      checks[name] = 'invalid_value';
      return undefined;
    }
    return value;
  };

  const status = read('status');
  if (status !== undefined && !STATUSES.includes(status)) checks.status = 'invalid_value';

  const sort = read('sort') ?? 'newest';
  if (!SORT_ORDERS.includes(sort)) checks.sort = 'invalid_value';

  const page = readInteger(read('page'), 1);
  if (page === null || page < 1) checks.page = 'invalid_value';

  const pageSize = readInteger(read('pageSize'), PAGINATION.defaultPageSize);
  if (pageSize === null || pageSize < 1 || pageSize > PAGINATION.maxPageSize) {
    checks.pageSize = 'invalid_value';
  }

  const q = allowSearch ? read('q')?.trim() || undefined : undefined;
  return { fields: fieldErrors(checks), value: { status, sort, page, pageSize, q } };
}

function readInteger(raw, fallback) {
  if (raw === undefined) return fallback;
  return /^\d{1,6}$/.test(raw) ? Number(raw) : null;
}

export function toUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

export function toDemo(demo) {
  const { originalName, sizeBytes, contentType, sha256 } = demo.file;
  return {
    id: demo.id,
    title: demo.title,
    genre: demo.genre,
    note: demo.note,
    status: demo.status,
    statusNote: demo.statusNote,
    createdAt: demo.createdAt,
    updatedAt: demo.updatedAt,
    file: { originalName, sizeBytes, contentType, sha256 },
  };
}

export function toAdminDemo(demo, owner) {
  return { ...toDemo(demo), artist: { id: owner.id, displayName: owner.displayName } };
}
