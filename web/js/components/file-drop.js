// @ts-check
import { formatBytes } from '../core/format.js';
import { onLangChange, t } from '../core/i18n.js';

/**
 * Only the last path segment: a file name is shown as text and never as a path.
 * @param {string} name
 */
export function displayFileName(name) {
  return name.split(/[\\/]/).pop() ?? '';
}

/**
 * A drop zone around a real file input. The input keeps keyboard access and the native picker;
 * dropping a file only fills that same input, so the form reads one source either way.
 * @param {HTMLElement} root element holding the input, [data-file-zone] and [data-file-selected]
 */
export function wireFileDrop(root) {
  const input = /** @type {HTMLInputElement} */ (root.querySelector('input[type="file"]'));
  const zone = /** @type {HTMLElement} */ (root.querySelector('[data-file-zone]'));
  const selected = /** @type {HTMLElement} */ (root.querySelector('[data-file-selected]'));
  let depth = 0;

  const show = () => {
    const file = input.files?.[0];
    selected.textContent = file
      ? t('upload.drop.selected', { name: displayFileName(file.name), size: formatBytes(file.size) })
      : '';
    root.toggleAttribute('data-has-file', Boolean(file));
  };

  const leave = () => {
    depth = 0;
    root.removeAttribute('data-dragging');
  };

  input.addEventListener('change', show);
  onLangChange(show);
  zone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    depth += 1;
    if (!input.disabled) root.setAttribute('data-dragging', '');
  });
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = input.disabled ? 'none' : 'copy';
  });
  zone.addEventListener('dragleave', () => {
    depth -= 1;
    if (depth <= 0) leave();
  });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    leave();
    const file = event.dataTransfer?.files[0];
    if (!file || input.disabled) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  show();
}
