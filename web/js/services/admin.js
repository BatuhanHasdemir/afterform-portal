// @ts-check
import * as api from '../core/api.js';
import { listQueryString, readListQuery } from './demos.js';
/** @import { AdminDemo, Page, Status } from '../core/types.js' */
/** @import { ListQuery } from './demos.js' */

/** @typedef {ListQuery & { q: string }} AdminListQuery */

/**
 * @param {AdminListQuery} query
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Page<AdminDemo>>}
 */
export async function listAdminDemos(query, { signal } = {}) {
  return /** @type {Page<AdminDemo>} */ (
    await api.get('/admin/demos', {
      query: { status: query.status, q: query.q, sort: query.sort, page: query.page, pageSize: query.pageSize },
      signal,
    })
  );
}

/**
 * @param {string} id
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<AdminDemo>}
 */
export async function getAdminDemo(id, { signal } = {}) {
  return /** @type {AdminDemo} */ (await api.get(`/admin/demos/${encodeURIComponent(id)}`, { signal }));
}

/**
 * @param {string} id
 * @param {{ status: Status, statusNote: string }} change
 * @returns {Promise<AdminDemo>}
 */
export async function changeStatus(id, change) {
  return /** @type {AdminDemo} */ (
    await api.patch(`/admin/demos/${encodeURIComponent(id)}/status`, statusChangeBody(change))
  );
}

/**
 * A blank note is left out; the server then clears the note, so the previous decision's note
 * never sticks to the new one.
 * @param {{ status: Status, statusNote: string }} change
 * @returns {{ status: Status, statusNote?: string }}
 */
export function statusChangeBody({ status, statusNote }) {
  const note = statusNote.trim();
  return note ? { status, statusNote: note } : { status };
}

/**
 * @param {URLSearchParams} params
 * @returns {AdminListQuery}
 */
export function readAdminListQuery(params) {
  return { ...readListQuery(params), q: (params.get('q') ?? '').trim() };
}

/** @param {AdminListQuery} query */
export function adminListQueryString(query) {
  const params = new URLSearchParams(listQueryString(query));
  if (query.q) params.set('q', query.q);
  const search = params.toString();
  return search ? `?${search}` : '';
}
