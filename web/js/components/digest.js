// @ts-check
import { h } from '../core/dom.js';

const FEEDBACK_MS = 4000;

/**
 * @param {string} hex
 * @param {number} [size]
 */
export function groupHex(hex, size = 8) {
  const groups = [];
  for (let i = 0; i < hex.length; i += size) groups.push(hex.slice(i, i + size));
  return groups;
}

/**
 * The hex value in groups of eight for reading, with a copy button. The groups are separate
 * inline elements with no characters between them, so a manual selection copies the plain value.
 * @param {string} hex
 * @param {{ copyLabelKey: string }} options aria-label key for the copy button
 */
export function digestView(hex, { copyLabelKey }) {
  const value = h(
    'code',
    { class: 'digest__value', translate: 'no' },
    groupHex(hex).map((group) => h('span', { class: 'digest__group' }, group)),
  );
  const feedback = h('span', { class: 'digest__feedback', role: 'status' });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  /** @param {string} key */
  const say = (key) => {
    clearTimeout(timer);
    // A fresh node each time lets screen readers announce the same message twice in a row.
    feedback.replaceChildren(h('span', { i18n: key }));
    timer = setTimeout(() => feedback.replaceChildren(), FEEDBACK_MS);
  };

  const copy = h('button', {
    type: 'button',
    class: 'btn btn--secondary digest__copy',
    i18n: 'common.copy',
    i18nAttr: { 'aria-label': copyLabelKey },
    on: {
      click: async () => {
        try {
          await navigator.clipboard.writeText(hex);
          say('common.copied');
        } catch {
          // Without clipboard access the text is selected instead, ready for a keyboard copy.
          const range = document.createRange();
          range.selectNodeContents(value);
          const selection = getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          say('common.copyFailed');
        }
      },
    },
  });

  return h('div', { class: 'digest' }, value, h('div', { class: 'digest__actions' }, copy, feedback));
}
