// @ts-check
import { renderFooter } from '../components/footer.js';
import { renderHeader } from '../components/header.js';
import { mountToastRegion } from '../components/toast.js';
import { loginUrl } from './api.js';
import { HOME_BY_ROLE, LOGIN_PATH } from './config.js';
import { h, replaceContent } from './dom.js';
import { errorKey, toApiError } from './errors.js';
import { initI18n } from './i18n.js';
import * as session from './session.js';
import { safeNextPath } from './validators.js';
/** @import { Access, Role, User } from './types.js' */

/**
 * Shared start of every page: language, header and footer, then the page's access rule.
 * Hiding a page here is a convenience only; the API enforces the same rule on every request.
 * @param {{ access: Access }} options
 * @returns {Promise<{ user: User | null } | null>} null when the page must not continue
 */
export async function bootPage({ access }) {
  await initI18n();
  const roles = allowedRoles(access);

  /** @type {User | null} */
  let user = null;
  try {
    user = await session.get();
  } catch (error) {
    // Public and guest pages still work without knowing the session; protected ones cannot.
    if (roles) {
      renderChrome(null);
      showBlockingView('common.loadFailed', errorKey(toApiError(error).code), true);
      return null;
    }
  }

  if (access === 'guest' && user) {
    location.replace(safeNextPath(new URLSearchParams(location.search).get('next'), homeFor(user)));
    return null;
  }
  if (roles && !user) {
    location.replace(loginUrl());
    return null;
  }

  renderChrome(user);
  if (roles && user && !roles.includes(user.role)) {
    showBlockingView('common.forbidden.title', 'common.forbidden.body', false);
    return null;
  }
  return { user };
}

/** @param {User} user */
export function homeFor(user) {
  return HOME_BY_ROLE[user.role] ?? '/';
}

/**
 * Sign-in page address with an optional page to return to and a one-time notice. An unsafe
 * `next` is dropped here already, so it never travels further.
 * @param {{ next?: string | null, notice?: 'registered' | 'password_reset' }} [options]
 */
export function loginLink({ next, notice } = {}) {
  const params = new URLSearchParams();
  if (notice) params.set('notice', notice);
  const safeNext = safeNextPath(next, '');
  if (safeNext) params.set('next', safeNext);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}

/**
 * @param {Access} access
 * @returns {Role[] | null} null when no sign-in is required
 */
function allowedRoles(access) {
  if (access === 'public' || access === 'guest') return null;
  return Array.isArray(access) ? access : [access];
}

/** @param {User | null} user */
function renderChrome(user) {
  renderHeader(user);
  renderFooter();
  mountToastRegion();
}

/**
 * @param {string} titleKey
 * @param {string} bodyKey
 * @param {boolean} retry
 */
function showBlockingView(titleKey, bodyKey, retry) {
  const main = document.getElementById('main');
  if (!main) return;
  replaceContent(
    main,
    h(
      'section',
      { class: 'state-view container' },
      h('h1', { class: 'state-view__title', i18n: titleKey }),
      h('p', { class: 'state-view__body', i18n: bodyKey }),
      h(
        'div',
        { class: 'state-view__actions' },
        retry &&
          h('button', {
            type: 'button',
            class: 'btn btn--primary',
            i18n: 'common.retry',
            on: { click: () => location.reload() },
          }),
        h('a', { class: 'btn btn--secondary', href: '/', i18n: 'common.backHome' }),
      ),
    ),
  );
  main.focus();
}
