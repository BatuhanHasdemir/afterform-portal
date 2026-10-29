// @ts-check
import { append, h } from '../core/dom.js';
/** @import { Child } from '../core/dom.js' */

let count = 0;

/**
 * @typedef {object} DialogOptions
 * @property {string} titleKey
 * @property {Child} content elements marked with data-dialog-close close the dialog
 * @property {HTMLElement | null} [opener] gets focus back on close; defaults to the focused element
 */

/**
 * A modal on the native <dialog>: the browser keeps focus inside it, makes the page behind it
 * inert and closes it on Escape. It exists only while open and is removed on close.
 * @param {DialogOptions} options
 * @returns {{ dialog: HTMLDialogElement, close: () => void }}
 */
export function openDialog({ titleKey, content, opener = focusedElement() }) {
  count += 1;
  const titleId = `dialog-title-${count}`;
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId });
  const close = () => {
    if (dialog.open) dialog.close();
  };

  append(dialog, [h('h2', { class: 'dialog__title', id: titleId, i18n: titleKey }), content]);
  dialog.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-dialog-close]')) close();
  });
  dialog.addEventListener('close', () => {
    // Not every browser hands focus back to the opener by itself.
    if (opener?.isConnected) opener.focus();
    // Removed once the closing transition, which starts on the next frame, has finished.
    requestAnimationFrame(() => {
      void Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished)).then(() => dialog.remove());
    });
  });

  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

function focusedElement() {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
