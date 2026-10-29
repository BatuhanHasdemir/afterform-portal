// @ts-check
import { startCountdown } from '../components/countdown.js';
import { enhanceForm, wirePasswordToggles } from '../components/form.js';
import { passwordInfoCard } from '../components/info-card.js';
import { qs } from '../core/dom.js';
import { bootPage, homeFor } from '../core/guard.js';
import { applyTranslations } from '../core/i18n.js';
import { safeNextPath, validateEmail } from '../core/validators.js';
import { login } from '../services/auth.js';

// Only known notices map to text; a value in the address is never shown as it is.
const NOTICES = new Map([
  ['registered', 'auth.notices.registered'],
  ['password_reset', 'auth.notices.passwordReset'],
]);

const params = new URLSearchParams(location.search);
const next = params.get('next');
const noticeKey = NOTICES.get(params.get('notice') ?? '');
// Shown once: removing it from the address keeps a reload from repeating it.
if (params.has('notice')) {
  params.delete('notice');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
}

const context = await bootPage({ access: 'guest' });
if (context) {
  const form = /** @type {HTMLFormElement} */ (qs('#login-form'));
  const status = qs('[data-status]');
  const lock = qs('[data-lock]');
  const timer = qs('[data-lock-timer]');

  /** @param {string} key */
  const announce = (key) => {
    status.setAttribute('data-i18n', key);
    applyTranslations(status);
  };
  if (noticeKey) announce(noticeKey);

  const safeNext = safeNextPath(next, '');
  if (safeNext) {
    qs('[data-register-link]').setAttribute('href', `/register.html?next=${encodeURIComponent(safeNext)}`);
  }
  qs('[data-info-card]').replaceWith(passwordInfoCard());
  wirePasswordToggles(form);

  enhanceForm(form, {
    fields: {
      email: { validate: validateEmail },
      password: { validate: (value) => (value === '' ? 'required' : null) },
    },
    async submit({ email, password }) {
      const user = await login({ email, password });
      location.assign(safeNextPath(next, homeFor(user)));
    },
    onError(error, controller) {
      if (error.code !== 'auth.too_many_attempts') return false;
      // The message names the reason (too many failed attempts), never an account or a lock,
      // and does not reveal how many attempts are left.
      const seconds = Math.max(1, error.retryAfterSeconds ?? 60);
      controller.setFormError({
        key: 'errors.auth.too_many_attempts',
        params: { count: Math.ceil(seconds / 60) },
      });
      controller.setLocked(true);
      lock.hidden = false;
      startCountdown(timer, seconds, () => {
        lock.hidden = true;
        controller.setFormError(null);
        controller.setLocked(false);
        announce('auth.login.lockEnded');
      });
      return true;
    },
  });
}
