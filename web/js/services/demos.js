// @ts-check
import * as api from '../core/api.js';
import { API_BASE, PAGINATION, SORT_ORDERS, STATUSES } from '../core/config.js';
/** @import { Demo, Page, SortOrder, Status } from '../core/types.js' */

/** @typedef {{ status: Status | null, sort: SortOrder, page: number, pageSize: number }} ListQuery */

/**
 * @param {ListQuery} query
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Page<Demo>>}
 */
export async function listDemos(query, { signal } = {}) {
  return /** @type {Page<Demo>} */ (
    await api.get('/demos', {
      query: { status: query.status, sort: query.sort, page: query.page, pageSize: query.pageSize },
      signal,
    })
  );
}

/**
 * @param {string} id
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Demo>}
 */
export async function getDemo(id, { signal } = {}) {
  return /** @type {Demo} */ (await api.get(`/demos/${encodeURIComponent(id)}`, { signal }));
}

/**
 * @param {{ title: string, genre: string, note: string, file: File }} input
 * @param {{ onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<Demo>}
 */
export async function uploadDemo({ title, genre, note, file }, options = {}) {
  const form = new FormData();
  // Text fields first: the server reads the parts in order and the file is the large one.
  form.set('title', title.trim());
  form.set('genre', genre);
  if (note.trim()) form.set('note', note.trim());
  form.set('file', file);
  return /** @type {Demo} */ (await api.upload('/demos', form, options));
}

/** @param {string} id */
export function audioUrl(id) {
  return `${API_BASE}/demos/${encodeURIComponent(id)}/audio`;
}

/**
 * List options from the page address. Values the API would reject fall back to the defaults,
 * so a hand-edited address shows a list instead of an error.
 * @param {URLSearchParams} params
 * @returns {ListQuery}
 */
export function readListQuery(params) {
  const status = params.get('status');
  const sort = params.get('sort');
  return {
    status: isOneOf(status, STATUSES) ? status : null,
    sort: isOneOf(sort, SORT_ORDERS) ? sort : 'newest',
    page: boundedInt(params.get('page'), 1, Number.MAX_SAFE_INTEGER),
    pageSize: boundedInt(params.get('pageSize'), PAGINATION.defaultPageSize, PAGINATION.maxPageSize),
  };
}

/**
 * The address query for a list state; defaults are left out to keep links short.
 * @param {ListQuery} query
 */
export function listQueryString(query) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== PAGINATION.defaultPageSize) params.set('pageSize', String(query.pageSize));
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * @template {string} T
 * @param {string | null} value
 * @param {readonly T[]} allowed
 * @returns {value is T}
 */
function isOneOf(value, allowed) {
  return value !== null && /** @type {readonly string[]} */ (allowed).includes(value);
}

/**
 * @param {string | null} raw
 * @param {number} fallback
 * @param {number} max
 */
function boundedInt(raw, fallback, max) {
  if (raw === null || !/^\d{1,9}$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= 1 && value <= max ? value : fallback;
}
