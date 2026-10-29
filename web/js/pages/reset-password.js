// @ts-check
import { enhanceForm, wirePasswordStrength, wirePasswordToggles } from '../components/form.js';
import { PASSWORD_RULES } from '../core/config.js';
import { qs } from '../core/dom.js';
import { bootPage, loginLink } from '../core/guard.js';
import { validatePassword } from '../core/validators.js';
import { resetPassword } from '../services/auth.js';

const params = new URLSearchParams(location.search);
const email = params.get('email') ?? '';
const token = params.get('token') ?? '';
// Removed before anything else runs: the token must not stay in the address bar, the history,
// a screenshot or a shared screen. From here on it lives only in this module.
if (location.search) history.replaceState(null, '', location.pathname);

const context = await bootPage({ access: 'guest' });
if (context) {
  const form = /** @type {HTMLFormElement} */ (qs('#reset-form'));
  const password = /** @type {HTMLInputElement} */ (qs('#reset-password'));

  const showInvalid = () => {
    qs('[data-request]').hidden = true;
    qs('[data-invalid]').hidden = false;
    qs('[data-invalid] h2').focus();
  };

  if (!email || !token) {
    showInvalid();
  } else {
    /** @type {HTMLInputElement} */ (qs('#reset-email')).value = email;
    wirePasswordToggles(form);
    wirePasswordStrength(password, qs('#reset-password-strength'));

    enhanceForm(form, {
      fields: {
        newPassword: {
          validate: validatePassword,
          limits: { min: PASSWORD_RULES.minLength, max: PASSWORD_RULES.maxLength },
        },
      },
      async submit({ newPassword }) {
        await resetPassword({ email, token, newPassword });
        location.assign(loginLink({ notice: 'password_reset' }));
      },
      onError(error) {
        if (error.code !== 'auth.reset_token_invalid') return false;
        showInvalid();
        return true;
      },
    });
  }
}
