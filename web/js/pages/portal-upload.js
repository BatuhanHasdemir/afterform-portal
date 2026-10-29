// @ts-check
import { groupHex } from '../components/digest.js';
import { displayFileName, wireFileDrop } from '../components/file-drop.js';
import { fingerprint } from '../components/fingerprint.js';
import { enhanceForm } from '../components/form.js';
import { glassOver } from '../components/header.js';
import { waveform } from '../components/signal.js';
import { statusBadge } from '../components/status-badge.js';
import { FIELD_LIMITS, GENRES, UPLOAD_RULES } from '../core/config.js';
import { h, qs, s } from '../core/dom.js';
import { errorKey } from '../core/errors.js';
import { canHashInBrowser, sameDigest, sha256OfFile } from '../core/file-hash.js';
import { formatBytes, formatPercent } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { applyTranslations, onLangChange, t } from '../core/i18n.js';
import { validateFile, validateGenre, validateNote, validateTitle } from '../core/validators.js';
import { uploadDemo } from '../services/demos.js';
/** @import { Status } from '../core/types.js' */

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
  const percentText = qs('[data-progress-percent]');
  const milestone = qs('[data-progress-milestone]');
  const cancel = qs('[data-cancel]');
  const status = qs('[data-status]');

  genre.append(...GENRES.map((value) => h('option', { value, i18n: `genre.${value}` })));
  describeRules(qs('[data-upload-rules]'), fileInput);
  wireFileDrop(qs('[data-file-drop]'));
  glassOver(qs('[data-scene-head]'));
  drawWave(qs('[data-drop-wave]'));
  whatNext(qs('[data-upload-next]'));
  const summary = liveSummary(fileInput);
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
    percentText.textContent = formatPercent(0);
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
    percentText.textContent = formatPercent(ratio);
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
      // Hashed here (usually already, when the file was chosen), then compared with the digest
      // the server computed from what it received: a difference means the bytes changed on the way.
      const localDigest = summary.digestFor(file);
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

/**
 * The aside follows the form as it is filled in: what will be sent, the steps done so far, and
 * the file's fingerprint, worked out here as soon as a file is chosen. That same digest is the
 * one compared with the server's after the upload, so the file is read only once.
 * @param {HTMLInputElement} fileInput
 */
function liveSummary(fileInput) {
  const form = /** @type {HTMLFormElement} */ (qs('#upload-form'));
  const title = /** @type {HTMLInputElement} */ (qs('#upload-title-input'));
  const genre = /** @type {HTMLSelectElement} */ (qs('#upload-genre'));
  const art = qs('[data-summary-print-art]');
  const digestText = qs('[data-summary-digest]');
  const note = qs('[data-summary-print-note]');
  /** @type {{ file: File, digest: Promise<string | null> } | null} */
  let hashed = null;
  let noteKey = 'upload.summary.waiting';

  /** @param {string} name @param {string} text */
  const fill = (name, text) => {
    const cell = qs(`[data-summary="${name}"]`);
    cell.textContent = text || t('upload.summary.empty');
    cell.toggleAttribute('data-empty', !text);
  };
  /** @param {string} name @param {'done' | 'current' | ''} state */
  const step = (name, state) => {
    const item = qs(`[data-upload-step="${name}"]`);
    if (state) item.dataset.state = state;
    else delete item.dataset.state;
  };

  const render = () => {
    const file = fileInput.files?.[0] ?? null;
    fill('title', title.value.trim());
    fill('genre', genre.value ? t(`genre.${genre.value}`) : '');
    fill('file', file ? `${displayFileName(file.name)} · ${formatBytes(file.size)}` : '');
    const details = validateTitle(title.value) === null && validateGenre(genre.value) === null;
    const recording = fileProblem(file) === null;
    step('details', details ? 'done' : 'current');
    step('file', recording ? 'done' : details ? 'current' : '');
    step('send', details && recording ? 'current' : '');
    note.textContent = t(noteKey);
  };

  const hash = async () => {
    const file = fileInput.files?.[0] ?? null;
    art.replaceChildren();
    digestText.replaceChildren();
    hashed = null;
    noteKey = !file || fileProblem(file) !== null ? 'upload.summary.waiting' : 'upload.summary.skipped';
    if (file && fileProblem(file) === null && canHashInBrowser(file)) {
      hashed = { file, digest: sha256OfFile(file).catch(() => null) };
      noteKey = 'upload.summary.hashing';
    }
    render();
    if (!hashed) return;
    const current = hashed;
    const hex = await current.digest;
    // Another file may have been chosen while this one was being read.
    if (hashed !== current) return;
    noteKey = hex ? 'upload.summary.ready' : 'upload.summary.skipped';
    if (hex) {
      art.replaceChildren(fingerprint(hex, { className: 'upload-summary__fp', draw: true }));
      digestText.replaceChildren(...groupHex(hex).map((group) => h('span', { class: 'digest__group', text: group })));
    }
    render();
  };

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  fileInput.addEventListener('change', () => void hash());
  onLangChange(render);
  render();

  return {
    /** @param {File} file */
    digestFor(file) {
      if (hashed?.file === file) return hashed.digest;
      return canHashInBrowser(file) ? sha256OfFile(file).catch(() => null) : Promise.resolve(null);
    },
  };
}

/**
 * A faint waveform across the drop zone, so the empty zone already reads as the place a
 * recording goes; it lights up while a file is dragged over it and once one is chosen (CSS).
 * @param {HTMLElement} host
 */
function drawWave(host) {
  const heights = waveform(56);
  host.replaceChildren(
    s(
      'svg',
      {
        class: 'file-drop__bars',
        viewBox: `0 0 ${heights.length * 2 - 1} 32`,
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      heights.map((height, i) => {
        const bar = s('rect', { class: 'file-drop__bar', x: i * 2, y: 16 - height * 16, width: 1, height: height * 32 });
        bar.style.setProperty('--i', String(i));
        return bar;
      }),
    ),
  );
}

/**
 * The road a demo takes once it is sent, in the same badges the portal shows later.
 * @param {HTMLElement} list
 */
function whatNext(list) {
  /** @type {Array<[Status[], string]>} */
  const rows = [
    [['pending'], 'upload.next.pending'],
    [['in_review'], 'upload.next.in_review'],
    [['accepted', 'rejected'], 'upload.next.decided'],
  ];
  list.replaceChildren(
    ...rows.map(([statuses, key]) =>
      h(
        'li',
        { class: 'upload-next__item' },
        h('span', { class: 'upload-next__badges' }, statuses.map((status) => statusBadge(status))),
        h('span', { class: 'upload-next__text', i18n: key }),
      ),
    ),
  );
}
