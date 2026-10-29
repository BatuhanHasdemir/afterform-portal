// @ts-check
import { wireFileDrop } from '../components/file-drop.js';
import { enhanceForm } from '../components/form.js';
import { FIELD_LIMITS, GENRES, UPLOAD_RULES } from '../core/config.js';
import { h, qs } from '../core/dom.js';
import { errorKey } from '../core/errors.js';
import { canHashInBrowser, sameDigest, sha256OfFile } from '../core/file-hash.js';
import { formatBytes, formatPercent } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { applyTranslations, t } from '../core/i18n.js';
import { validateFile, validateGenre, validateNote, validateTitle } from '../core/validators.js';
import { uploadDemo } from '../services/demos.js';

const context = await bootPage({ access: 'artist' });
if (context) {
  const form = /** @type {HTMLFormElement} */ (qs('#upload-form'));
  const fields = /** @type {HTMLFieldSetElement} */ (qs('[data-fields]'));
  const genre = /** @type {HTMLSelectElement} */ (qs('#upload-genre'));
  const fileInput = /** @type {HTMLInputElement} */ (qs('#upload-file'));
  const submit = /** @type {HTMLButtonElement} */ (qs('#upload-form [type="submit"]'));
  const progress = qs('[data-progress]');
  const bar = /** @type {HTMLProgressElement} */ (qs('[data-progress] progress'));
  const progressText = qs('[data-progress-text]');
  const milestone = qs('[data-progress-milestone]');
  const cancel = qs('[data-cancel]');
  const status = qs('[data-status]');

  genre.append(...GENRES.map((value) => h('option', { value, i18n: `genre.${value}` })));
  describeRules(qs('[data-upload-rules]'), fileInput);
  wireFileDrop(qs('[data-file-drop]'));
  // A file dropped beside the zone would otherwise open in the tab and throw the form away.
  for (const type of ['dragover', 'drop']) window.addEventListener(type, (event) => event.preventDefault());

  /** @type {AbortController | null} */
  let upload = null;
  let lastQuarter = 0;
  cancel.addEventListener('click', () => upload?.abort());

  /** @param {boolean} on */
  const setUploading = (on) => {
    fields.disabled = on;
    progress.hidden = !on;
    submit.hidden = on;
    if (!on) return;
    bar.value = 0;
    lastQuarter = 0;
    progressText.textContent = '';
    milestone.textContent = '';
    status.replaceChildren();
    status.removeAttribute('data-i18n');
    // The submit button has just been hidden; the only useful control now is Cancel.
    cancel.focus();
  };

  /**
   * Shown continuously, announced only at every quarter: a live region that spoke on each
   * progress event would drown everything else out.
   * @param {number} loaded
   * @param {number} total
   */
  const showProgress = (loaded, total) => {
    const ratio = total > 0 ? Math.min(1, loaded / total) : 0;
    bar.value = Math.round(ratio * 100);
    progressText.textContent =
      ratio >= 1
        ? t('upload.processing')
        : t('upload.progress', { percent: formatPercent(ratio), loaded: formatBytes(loaded), total: formatBytes(total) });
    const quarter = Math.floor(ratio * 4);
    if (quarter > lastQuarter) {
      lastQuarter = quarter;
      milestone.textContent = t('upload.milestone', { percent: formatPercent(quarter / 4) });
    }
  };

  enhanceForm(form, {
    fields: {
      title: { validate: validateTitle, limits: FIELD_LIMITS.title },
      genre: { validate: validateGenre },
      note: { validate: validateNote, limits: FIELD_LIMITS.note },
      file: { validate: () => fileProblem(fileInput.files?.[0] ?? null) },
    },
    async submit(values) {
      const file = fileInput.files?.[0];
      if (!file) return;
      upload = new AbortController();
      setUploading(true);
      // Hashed here while the upload runs, then compared with the digest the server computed
      // from what it received: a difference means the bytes changed on the way.
      const localDigest = canHashInBrowser(file) ? sha256OfFile(file).catch(() => null) : Promise.resolve(null);
      const demo = await uploadDemo(
        { title: values.title, genre: values.genre, note: values.note, file },
        { signal: upload.signal, onProgress: showProgress },
      );
      const local = await localDigest;
      const check = local === null ? 'unchecked' : sameDigest(local, demo.file.sha256) ? 'match' : 'mismatch';
      location.assign(`/portal/demo.html?id=${encodeURIComponent(demo.id)}&uploaded=${check}`);
    },
    onError(error, controller) {
      setUploading(false);
      submit.focus();
      if (error.code !== 'upload.too_large' && error.code !== 'upload.unsupported_type') return false;
      controller.setFieldError('file', { key: errorKey(error.code) });
      controller.focusField('file');
      return true;
    },
    onCancel() {
      setUploading(false);
      status.setAttribute('data-i18n', 'upload.cancelled');
      applyTranslations(status);
      submit.focus();
    },
  });
}

/**
 * @param {File | null} file
 * @returns {'required' | { key: string } | null}
 */
function fileProblem(file) {
  const problem = validateFile(file);
  if (problem === null || problem === 'required') return problem;
  return { key: errorKey(problem === 'too_large' ? 'upload.too_large' : 'upload.unsupported_type') };
}

/**
 * The size and type hints, and the picker's accept filter, appear only once there are rules.
 * @param {HTMLElement} hint
 * @param {HTMLInputElement} input
 */
function describeRules(hint, input) {
  const { maxBytes, allowedExtensions, allowedMimeTypes } = UPLOAD_RULES;
  if (maxBytes !== null) {
    hint.append(' ', h('span', { i18n: 'upload.drop.maxSize', i18nParams: { size: formatBytes(maxBytes) } }));
  }
  if (allowedExtensions.length > 0) {
    const types = allowedExtensions.map((extension) => extension.toUpperCase()).join(', ');
    hint.append(' ', h('span', { i18n: 'upload.drop.types', i18nParams: { types } }));
  }
  const accept = [...allowedExtensions.map((extension) => `.${extension}`), ...allowedMimeTypes];
  if (accept.length > 0) input.setAttribute('accept', accept.join(','));
}
