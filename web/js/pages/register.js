// @ts-check
import { enhanceForm, wirePasswordStrength, wirePasswordToggles } from '../components/form.js';
import { passwordInfoCard } from '../components/info-card.js';
import { FIELD_LIMITS, PASSWORD_RULES } from '../core/config.js';
import { qs } from '../core/dom.js';
import { errorKey } from '../core/errors.js';
import { bootPage, loginLink } from '../core/guard.js';
import { validateDisplayName, validateEmail, validatePassword } from '../core/validators.js';
import { register } from '../services/auth.js';

const next = new URLSearchParams(location.search).get('next');

const context = await bootPage({ access: 'guest' });
if (context) {
  const form = /** @type {HTMLFormElement} */ (qs('#register-form'));
  const password = /** @type {HTMLInputElement} */ (qs('#register-password'));

  qs('[data-login-link]').setAttribute('href', loginLink({ next }));
  qs('[data-info-card]').replaceWith(passwordInfoCard());
  wirePasswordToggles(form);
  wirePasswordStrength(password, qs('#register-password-strength'));

  enhanceForm(form, {
    fields: {
      displayName: { validate: validateDisplayName, limits: FIELD_LIMITS.displayName },
      email: { validate: validateEmail, limits: FIELD_LIMITS.email },
      password: {
        validate: validatePassword,
        limits: { min: PASSWORD_RULES.minLength, max: PASSWORD_RULES.maxLength },
      },
    },
    async submit(values) {
      await register({
        displayName: values.displayName,
        email: values.email,
        password: values.password,
      });
      // No automatic sign-in: the new account signs in like any other.
      location.assign(loginLink({ next, notice: 'registered' }));
    },
    onError(error, controller) {
      if (error.code !== 'auth.email_taken') return false;
      controller.setFieldError('email', { key: errorKey(error.code) });
      controller.focusField('email');
      return true;
    },
  });
}
