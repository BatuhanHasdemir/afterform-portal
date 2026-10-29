// @ts-check
import { PASSWORD_RULES } from '../core/config.js';
import { h, replaceContent } from '../core/dom.js';
import { ApiError, errorKey, fieldErrorKey, toApiError } from '../core/errors.js';
import { onLangChange, t } from '../core/i18n.js';
/** @import { FieldErrorCode } from '../core/types.js' */

/** @typedef {{ key: string, params?: Record<string, string | number> }} Message */
/** @typedef {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} FormControl */

/**
 * @typedef {object} FieldRule
 * @property {(value: string, control: FormControl | null) => FieldErrorCode | Message | null} validate
 *   a field error code, or a ready message for problems that are not field codes (e.g. a file
 *   that is too large)
 * @property {{ min?: number, max?: number }} [limits] values for the length messages
 */

/**
 * @typedef {object} FormController
 * @property {(name: string, message: Message | null) => void} setFieldError
 * @property {(message: Message | null) => void} setFormError
 * @property {(name: string) => void} focusField
 * @property {(locked: boolean) => void} setLocked
 */

/**
 * @typedef {object} FormOptions
 * @property {Record<string, FieldRule>} fields keyed by the inputs' name attribute
 * @property {(values: Record<string, string>) => Promise<void>} submit The button stays
 *   busy after it resolves, because success normally navigates away.
 * @property {boolean} [repeatable] the form stays on the page after a success and can be sent
 *   again, so the button is released
 * @property {(error: ApiError, form: FormController) => boolean} [onError] true when handled
 * @property {() => void} [onCancel] the submit was aborted by the user; no error is shown
 */

/** @typedef {'empty' | 'short' | 'fair' | 'strong'} StrengthLevel */

/** @type {Readonly<Record<'fair' | 'strong', string>>} */
const STRENGTH_KEYS = Object.freeze({
  fair: 'auth.password.strength.fair',
  strong: 'auth.password.strength.strong',
});

/**
 * Busy buttons use aria-disabled rather than disabled: they keep focus, so a keyboard user is
 * not thrown back to the top of the page when a request finishes.
 * @param {HTMLElement | null} button
 * @param {boolean} busy
 */
export function setBusy(button, busy) {
  if (!button) return;
  toggleAttr(button, 'aria-busy', busy);
  toggleAttr(button, 'aria-disabled', busy);
}

/**
 * @param {FieldErrorCode} code
 * @param {FieldRule | undefined} rule
 * @returns {Message}
 */
export function messageFor(code, rule) {
  return {
    key: fieldErrorKey(code),
    params: { min: rule?.limits?.min ?? 0, max: rule?.limits?.max ?? 0 },
  };
}

/**
 * @param {Record<string, string>} values
 * @param {Record<string, FieldRule>} rules
 * @param {(name: string) => FormControl | null} [controlFor]
 * @returns {Map<string, Message>} the first problem of each failing field, in rule order
 */
export function checkFields(values, rules, controlFor = () => null) {
  /** @type {Map<string, Message>} */
  const problems = new Map();
  for (const [name, rule] of Object.entries(rules)) {
    const problem = rule.validate(values[name] ?? '', controlFor(name));
    if (typeof problem === 'string') problems.set(name, messageFor(problem, rule));
    else if (problem) problems.set(name, problem);
  }
  return problems;
}

/**
 * A hint only: length counts first, variety second; the server's length rule stays the
 * authority and no composition is required.
 * @param {string} value
 * @param {number} [min]
 * @returns {{ level: StrengthLevel, missing: number }}
 */
export function passwordStrength(value, min = PASSWORD_RULES.minLength) {
  if (value.length === 0) return { level: 'empty', missing: min };
  if (value.length < min) return { level: 'short', missing: min - value.length };
  const variety = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) => re.test(value)).length;
  const strong = value.length >= min + 4 || variety >= 3;
  return { level: strong ? 'strong' : 'fair', missing: 0 };
}

/**
 * Client checks, an error summary above the form, per-field messages linked with
 * aria-describedby, server error mapping and double-submit protection.
 * @param {HTMLFormElement} form
 * @param {FormOptions} options
 * @returns {FormController}
 */
export function enhanceForm(form, options) {
  form.noValidate = true;
  const submitButton = /** @type {HTMLButtonElement | null} */ (form.querySelector('button[type="submit"]'));
  const summary = h('div', { class: 'error-summary', tabindex: '-1', hidden: true });
  const alert = h('div', { class: 'form-alert', role: 'alert' });
  form.before(summary, alert);

  /** @type {Map<string, Message>} */
  let fieldErrors = new Map();
  /** @type {Message | null} */
  let formError = null;
  let busy = false;
  let locked = false;

  /**
   * @param {string} name
   * @returns {FormControl | null}
   */
  const control = (name) => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      ? el
      : null;
  };

  const syncButton = () => {
    if (!submitButton) return;
    toggleAttr(submitButton, 'aria-busy', busy);
    toggleAttr(submitButton, 'aria-disabled', busy || locked);
  };

  const render = () => {
    for (const name of Object.keys(options.fields)) {
      const el = control(name);
      if (el) renderFieldError(el, fieldErrors.get(name) ?? null);
    }
    renderSummary();
    const text = formError ? t(formError.key, formError.params) : '';
    // Rewriting identical text would make screen readers announce the alert again.
    if (alert.textContent !== text) replaceContent(alert, text ? h('p', { class: 'form-alert__text', text }) : null);
  };

  const renderSummary = () => {
    if (fieldErrors.size === 0) {
      summary.hidden = true;
      summary.replaceChildren();
      return;
    }
    replaceContent(
      summary,
      h('h2', { class: 'error-summary__title', i18n: 'common.form.errorSummary' }),
      h(
        'ul',
        { class: 'error-summary__list' },
        [...fieldErrors].map(([name, message]) => {
          const el = control(name);
          const label = el?.labels?.[0]?.textContent?.trim() || name;
          return h(
            'li',
            {},
            h(
              'a',
              {
                href: `#${el?.id ?? ''}`,
                on: {
                  click: (event) => {
                    event.preventDefault();
                    el?.focus();
                  },
                },
              },
              `${label}: ${t(message.key, message.params)}`,
            ),
          );
        }),
      ),
    );
    summary.hidden = false;
  };

  const focusFirstError = () => {
    const first = Object.keys(options.fields).find((name) => fieldErrors.has(name));
    if (first) control(first)?.focus();
  };

  /** @type {FormController} */
  const controller = {
    setFieldError(name, message) {
      if (message) fieldErrors.set(name, message);
      else fieldErrors.delete(name);
      render();
    },
    setFormError(message) {
      formError = message;
      render();
    },
    focusField(name) {
      control(name)?.focus();
    },
    setLocked(value) {
      locked = value;
      syncButton();
    },
  };

  /** @param {ApiError} error */
  const handleError = (error) => {
    if (options.onError?.(error, controller)) return;
    if (error.code === 'validation.failed') {
      const known = Object.entries(error.fields).filter(([name]) => name in options.fields);
      if (known.length > 0) {
        fieldErrors = new Map(known.map(([name, codes]) => [name, messageFor(codes[0], options.fields[name])]));
        render();
        focusFirstError();
        return;
      }
    }
    controller.setFormError({ key: errorKey(error.code) });
  };

  const handleSubmit = async () => {
    if (busy || locked) return;
    concealPasswords(form);
    /** @type {Record<string, string>} */
    const values = {};
    for (const name of Object.keys(options.fields)) values[name] = control(name)?.value ?? '';

    fieldErrors = checkFields(values, options.fields, control);
    formError = null;
    render();
    if (fieldErrors.size > 0) {
      focusFirstError();
      return;
    }

    busy = true;
    syncButton();
    try {
      await options.submit(values);
      if (options.repeatable) {
        busy = false;
        syncButton();
      }
    } catch (error) {
      busy = false;
      if (error instanceof DOMException && error.name === 'AbortError') options.onCancel?.();
      else handleError(toApiError(error));
      syncButton();
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });
  for (const name of Object.keys(options.fields)) {
    control(name)?.addEventListener('input', () => {
      if (fieldErrors.delete(name)) render();
    });
  }
  onLangChange(render);
  return controller;
}

/**
 * Wires every [data-password-toggle] button under `root` to the input named in aria-controls.
 * @param {ParentNode} root
 */
export function wirePasswordToggles(root) {
  for (const button of root.querySelectorAll('button[data-password-toggle]')) {
    const input = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (!(input instanceof HTMLInputElement)) continue;
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
    });
  }
}

/**
 * Updates the strength hint under a new-password field as the user types.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} meter element with a [data-strength-text] child
 */
export function wirePasswordStrength(input, meter) {
  const text = meter.querySelector('[data-strength-text]');
  const update = () => {
    const { level, missing } = passwordStrength(input.value);
    meter.dataset.level = level;
    if (!text) return;
    if (level === 'empty') text.textContent = '';
    else if (level === 'short') text.textContent = t('auth.password.strength.short', { count: missing });
    else text.textContent = t(STRENGTH_KEYS[level]);
  };
  input.addEventListener('input', update);
  onLangChange(update);
  update();
}

/**
 * Passwords go back to type="password" before submitting: password managers look for that
 * type, and a visible password should not stay on screen after the form is sent.
 * @param {HTMLFormElement} form
 */
function concealPasswords(form) {
  for (const button of form.querySelectorAll('button[data-password-toggle][aria-pressed="true"]')) {
    const input = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (input instanceof HTMLInputElement) input.type = 'password';
    button.setAttribute('aria-pressed', 'false');
  }
}

/**
 * @param {FormControl} el
 * @param {Message | null} message
 */
function renderFieldError(el, message) {
  const id = `${el.id}-error`;
  let errorEl = document.getElementById(id);
  if (!errorEl && message) {
    errorEl = h('p', { class: 'field__error', id });
    (el.closest('.input-group, .file-drop') ?? el).before(errorEl);
  }
  if (!errorEl) return;
  const text = message ? t(message.key, message.params) : '';
  if (errorEl.textContent !== text) errorEl.textContent = text;
  errorEl.hidden = !message;
  toggleAttr(el, 'aria-invalid', Boolean(message));
  const others = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((token) => token && token !== id);
  const ids = message ? [id, ...others] : others;
  if (ids.length > 0) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

/**
 * @param {Element} el
 * @param {string} name
 * @param {boolean} on
 */
function toggleAttr(el, name, on) {
  if (on) el.setAttribute(name, 'true');
  else el.removeAttribute(name);
}
