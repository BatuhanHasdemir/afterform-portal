// @ts-check
import { enhanceForm } from '../components/form.js';
import { FIELD_LIMITS } from '../core/config.js';
import { qs } from '../core/dom.js';
import { bootPage } from '../core/guard.js';
import { validateEmail } from '../core/validators.js';
import { forgotPassword } from '../services/auth.js';

const context = await bootPage({ access: 'guest' });
if (context) {
  const form = /** @type {HTMLFormElement} */ (qs('#forgot-form'));

  enhanceForm(form, {
    fields: { email: { validate: validateEmail, limits: FIELD_LIMITS.email } },
    async submit({ email }) {
      await forgotPassword({ email });
      // The same confirmation for every address: the page must not reveal who is registered.
      qs('[data-request]').hidden = true;
      qs('[data-sent]').hidden = false;
      qs('[data-sent] h2').focus();
    },
  });
}
