// @ts-check
import { h } from '../core/dom.js';

/** @typedef {'info' | 'ok' | 'warn' | 'danger'} ToastTone */

const DEFAULT_TIMEOUT_MS = 6000;

/** @type {HTMLElement | null} */
let region = null;

/**
 * The live region has to be in the document before messages are added, otherwise screen
 * readers may not announce the first one; pages mount it at start-up.
 */
export function mountToastRegion() {
  if (region?.isConnected) return region;
  region = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
  document.body.append(region);
  return region;
}

/**
 * @param {string} message translated text
 * @param {{ tone?: ToastTone, timeoutMs?: number | null }} [options] errors stay until dismissed
 */
export function showToast(message, { tone = 'info', timeoutMs } = {}) {
  const host = mountToastRegion();
  const delay = timeoutMs === undefined ? (tone === 'danger' ? null : DEFAULT_TIMEOUT_MS) : timeoutMs;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const item = h(
    'div',
    { class: ['toast', `toast--${tone}`] },
    h('p', { class: 'toast__message', text: message }),
    h(
      'button',
      {
        type: 'button',
        class: 'toast__close',
        i18nAttr: { 'aria-label': 'common.close' },
        on: { click: () => dismiss() },
      },
      h('span', { 'aria-hidden': 'true' }, '×'),
    ),
  );

  function dismiss() {
    clearTimeout(timer);
    item.remove();
  }

  host.append(item);
  if (delay !== null) timer = setTimeout(dismiss, delay);
  return dismiss;
}
