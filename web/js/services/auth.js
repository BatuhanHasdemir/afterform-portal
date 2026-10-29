// @ts-check
import * as api from '../core/api.js';
import * as csrf from '../core/csrf.js';
import * as session from '../core/session.js';
/** @import { User } from '../core/types.js' */

// The server binds the CSRF token to the signed-in identity, so every sign-in and sign-out
// also drops the cached token.

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<User>}
 */
export async function login({ email, password }) {
  const result = /** @type {{ user: User }} */ (
    await api.post('/auth/login', { email: email.trim(), password })
  );
  session.set(result.user);
  csrf.reset();
  return result.user;
}

/** @param {{ displayName: string, email: string, password: string }} account */
export async function register({ displayName, email, password }) {
  await api.post('/auth/register', {
    displayName: displayName.trim(),
    email: email.trim(),
    password,
  });
}

/** @param {{ email: string }} request */
export async function forgotPassword({ email }) {
  await api.post('/auth/forgot-password', { email: email.trim() });
}

/** @param {{ email: string, token: string, newPassword: string }} request */
export async function resetPassword({ email, token, newPassword }) {
  await api.post('/auth/reset-password', { email, token, newPassword });
}

export async function logout() {
  await api.post('/auth/logout');
  session.clear();
  csrf.reset();
}
