// @ts-check
import { VERIFY_MAX_BYTES } from '../core/config.js';
import { h, icon } from '../core/dom.js';
import { canHashInBrowser, sameDigest, sha256OfFile } from '../core/file-hash.js';
import { formatBytes } from '../core/format.js';
import { groupHex } from './digest.js';
import { wireFileDrop } from './file-drop.js';

/** Colour, icon and words together, as everywhere else a state is shown. */
const ICONS = Object.freeze({ ok: 'status-accepted', danger: 'status-rejected', warn: 'warning' });

let count = 0;

/**
 * Compares a local file with a stored digest. The file never leaves the device: its SHA-256 is
 * computed by the browser and only the two digests are compared.
 * @param {{ expected: string, labelledBy: string }} options the stored digest; the id naming the input
 */
export function verifyFile({ expected, labelledBy }) {
  count += 1;
  const ids = { input: `verify-file-${count}`, hint: `verify-file-hint-${count}`, selected: `verify-file-selected-${count}` };

  const input = h('input', {
    class: 'file-drop__input',
    id: ids.input,
    type: 'file',
    'aria-labelledby': labelledBy,
    'aria-describedby': `${ids.hint} ${ids.selected}`,
  });
  const zoneIcon = icon('upload');
  zoneIcon.classList.add('file-drop__icon');
  const drop = h(
    'div',
    { class: 'file-drop file-drop--compact' },
    input,
    h(
      'label',
      { class: 'file-drop__zone', for: ids.input, dataset: { fileZone: '' } },
      zoneIcon,
      h('span', { class: 'file-drop__title', i18n: 'demos.detail.verify.drop' }),
      h('span', {
        class: 'file-drop__hint',
        id: ids.hint,
        i18n: 'demos.detail.verify.hint',
        i18nParams: { size: formatBytes(VERIFY_MAX_BYTES) },
      }),
    ),
    h('p', { class: 'file-drop__selected', id: ids.selected, 'aria-live': 'polite', dataset: { fileSelected: '' } }),
  );
  const result = h('div', { class: 'verify-result', role: 'status' });
  wireFileDrop(drop);

  let run = 0;
  /**
   * @param {'ok' | 'danger' | 'warn'} tone
   * @param {string} key
   * @param {{ params?: Record<string, string | number>, digest?: string }} [extra]
   */
  const show = (tone, key, { params, digest } = {}) => {
    result.removeAttribute('aria-busy');
    result.replaceChildren(
      h(
        'div',
        { class: ['verify-result__box', `verify-result__box--${tone}`] },
        h('p', { class: 'verify-result__message' }, icon(ICONS[tone]), h('span', { i18n: key, i18nParams: params })),
        digest &&
          h(
            'div',
            { class: 'verify-result__digest' },
            h('p', { class: 'verify-result__label', i18n: 'demos.detail.verify.localDigest' }),
            h('code', { class: 'digest__value', translate: 'no' }, groupHex(digest).map((group) => h('span', { class: 'digest__group' }, group))),
          ),
      ),
    );
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    // A newer choice wins over a slower, older one.
    const current = ++run;
    if (!file) {
      result.removeAttribute('aria-busy');
      result.replaceChildren();
      return;
    }
    if (!globalThis.crypto?.subtle) return show('warn', 'demos.detail.verify.unavailable');
    if (!canHashInBrowser(file)) {
      return show('warn', 'demos.detail.verify.tooLarge', { params: { size: formatBytes(VERIFY_MAX_BYTES) } });
    }
    result.setAttribute('aria-busy', 'true');
    result.replaceChildren(h('p', { class: 'verify-result__busy', i18n: 'demos.detail.verify.computing' }));
    try {
      const actual = await sha256OfFile(file);
      if (current !== run) return;
      if (sameDigest(actual, expected)) show('ok', 'demos.detail.verify.match', { digest: actual });
      else show('danger', 'demos.detail.verify.mismatch', { digest: actual });
    } catch {
      if (current === run) show('warn', 'demos.detail.verify.failed');
    }
  });

  return h('div', { class: 'verify' }, drop, result);
}
