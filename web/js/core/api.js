// @ts-check
import { API_BASE, LOGIN_PATH, REQUEST_TIMEOUT_MS } from './config.js';
import * as csrf from './csrf.js';
import { ApiError, NETWORK_ERROR, SERVER_ERROR, apiErrorFrom } from './errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * @typedef {object} RequestOptions
 * @property {Record<string, string | number | null | undefined>} [query]
 * @property {AbortSignal} [signal]
 * @property {boolean} [redirectOnUnauthenticated] defaults to true
 */

/**
 * @typedef {object} UploadOptions
 * @property {(loaded: number, total: number) => void} [onProgress]
 * @property {AbortSignal} [signal]
 * @property {boolean} [redirectOnUnauthenticated] defaults to true
 */

/**
 * @param {string} path relative to API_BASE, e.g. '/demos'
 * @param {RequestOptions} [options]
 */
export function get(path, options) {
  return request('GET', path, undefined, options);
}

/**
 * @param {string} path
 * @param {unknown} [body]
 * @param {RequestOptions} [options]
 */
export function post(path, body, options) {
  return request('POST', path, body, options);
}

/**
 * @param {string} path
 * @param {unknown} [body]
 * @param {RequestOptions} [options]
 */
export function patch(path, body, options) {
  return request('PATCH', path, body, options);
}

/**
 * Multipart upload. XMLHttpRequest is used because fetch reports no upload progress.
 * @param {string} path
 * @param {FormData} formData
 * @param {UploadOptions} [options]
 * @returns {Promise<unknown>}
 */
export async function upload(path, formData, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const token = await csrfToken();
    const result = await sendXhr(apiUrl(path), formData, token, options);
    const data = parseJson(result.contentType, result.text);
    if (result.status >= 200 && result.status < 300) return data;

    const error = apiErrorFrom(result.status, data, result.retryAfter);
    if (error.code === 'csrf.invalid' && attempt === 0) {
      csrf.reset();
      continue;
    }
    handleUnauthenticated(error, options.redirectOnUnauthenticated);
    throw error;
  }
}

/** @param {string} [next] path to return to after signing in */
export function loginUrl(next = location.pathname + location.search) {
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * @param {string} method
 * @param {string} path
 * @param {unknown} body
 * @param {RequestOptions} [options]
 * @returns {Promise<unknown>}
 */
async function request(method, path, body, options = {}) {
  const unsafe = UNSAFE_METHODS.has(method);
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; ; attempt += 1) {
    if (unsafe) headers['X-CSRF-TOKEN'] = await csrfToken();
    const response = await send(
      apiUrl(path, options.query),
      { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' },
      options.signal,
    );
    const data = await readJson(response);
    if (response.ok) return data;

    const error = apiErrorFrom(response.status, data, response.headers.get('Retry-After'));
    // A stale token is expected after the server rotates it; one retry with a fresh token is
    // enough, a second failure is a real error.
    if (unsafe && error.code === 'csrf.invalid' && attempt === 0) {
      csrf.reset();
      continue;
    }
    handleUnauthenticated(error, options.redirectOnUnauthenticated);
    throw error;
  }
}

function csrfToken() {
  return csrf.ensureToken(async () => {
    const response = await send(apiUrl('/csrf'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw apiErrorFrom(response.status, data, response.headers.get('Retry-After'));
    }
    const token = typeof data === 'object' && data !== null ? Reflect.get(data, 'token') : null;
    if (typeof token !== 'string' || token === '') {
      throw new ApiError({ status: response.status, code: SERVER_ERROR });
    }
    return token;
  });
}

/**
 * @param {ApiError} error
 * @param {boolean | undefined} redirect
 */
function handleUnauthenticated(error, redirect) {
  if (error.code === 'auth.unauthenticated' && redirect !== false) {
    location.assign(loginUrl());
  }
}

/**
 * @param {string} path
 * @param {RequestOptions['query']} [query]
 */
function apiUrl(path, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_BASE}${path}${search ? `?${search}` : ''}`;
}

/**
 * fetch with a timeout. Failures become `network.error`, except an abort requested by the
 * caller, which is rethrown so the caller can ignore it.
 * @param {string} url
 * @param {RequestInit} init
 * @param {AbortSignal} [signal]
 */
async function send(url, init, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError({ status: 0, code: NETWORK_ERROR });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function readJson(response) {
  let text = '';
  try {
    text = await response.text();
  } catch {
    if (response.ok) throw new ApiError({ status: response.status, code: NETWORK_ERROR });
    return null;
  }
  try {
    return parseJson(response.headers.get('Content-Type'), text);
  } catch (error) {
    if (response.ok) throw error;
    return null;
  }
}

/**
 * @param {string | null} contentType
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(contentType, text) {
  if (!text || !contentType || !/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError({ status: 0, code: SERVER_ERROR });
  }
}

/**
 * @param {string} url
 * @param {FormData} formData
 * @param {string} token
 * @param {UploadOptions} options
 * @returns {Promise<{ status: number, text: string, contentType: string | null, retryAfter: string | null }>}
 */
function sendXhr(url, formData, token, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });

    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-CSRF-TOKEN', token);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      });
    }
    xhr.addEventListener('load', () => {
      cleanup();
      resolve({
        status: xhr.status,
        text: xhr.responseText,
        contentType: xhr.getResponseHeader('Content-Type'),
        retryAfter: xhr.getResponseHeader('Retry-After'),
      });
    });
    xhr.addEventListener('error', () => {
      cleanup();
      reject(new ApiError({ status: 0, code: NETWORK_ERROR }));
    });
    xhr.addEventListener('abort', () => {
      cleanup();
      reject(abortReason(signal));
    });
    xhr.send(formData);
  });
}

/** @param {AbortSignal | undefined} signal */
function abortReason(signal) {
  return signal?.reason ?? new DOMException('The request was aborted.', 'AbortError');
}
