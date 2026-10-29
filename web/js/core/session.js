// @ts-check
import * as api from './api.js';
import { ApiError } from './errors.js';
/** @import { User } from './types.js' */

// Cached for the lifetime of the page; the server stays the authority on every request.
/** @type {Promise<User | null> | null} */
let cached = null;

/**
 * The signed-in user, or null when there is no session.
 * @returns {Promise<User | null>}
 */
export function get() {
  if (!cached) {
    cached = api.get('/me', { redirectOnUnauthenticated: false }).then(
      (user) => /** @type {User} */ (user),
      (error) => {
        if (error instanceof ApiError && error.status === 401) return null;
        cached = null;
        throw error;
      },
    );
  }
  return cached;
}

/** @param {User} user */
export function set(user) {
  cached = Promise.resolve(user);
}

export function clear() {
  cached = Promise.resolve(null);
}
