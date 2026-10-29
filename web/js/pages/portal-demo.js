// @ts-check
import { digestView } from '../components/digest.js';
import { displayFileName } from '../components/file-drop.js';
import { fingerprint } from '../components/fingerprint.js';
import { infoCard } from '../components/info-card.js';
import { statusBadge } from '../components/status-badge.js';
import { openStatusDialog, statusButton } from '../components/status-control.js';
import { verifyFile } from '../components/verify-file.js';
import { GENRES } from '../core/config.js';
import { h, qs, replaceContent } from '../core/dom.js';
import { errorKey, toApiError } from '../core/errors.js';
import { formatBytes, formatDateTime, localizeFormats } from '../core/format.js';
import { bootPage, homeFor } from '../core/guard.js';
import { onLangChange, t } from '../core/i18n.js';
import { getAdminDemo } from '../services/admin.js';
import { audioUrl, getDemo } from '../services/demos.js';
/** @import { AdminDemo, Demo, User } from '../core/types.js' */
/** @import { Child } from '../core/dom.js' */

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
// Set by the upload page: 'match' or 'mismatch' after comparing its own digest of the file
// with the server's, 'unchecked' when the browser could not compute one.
const uploadCheck = params.get('uploaded');
if (params.has('uploaded')) {
  params.delete('uploaded');
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

const context = await bootPage({ access: ['artist', 'admin'] });
if (context?.user) {
  const user = context.user;
  const view = qs('[data-view]');

  /** @param {Child} content */
  const show = (content) => {
    view.removeAttribute('aria-busy');
    replaceContent(view, content);
  };

  const load = async () => {
    view.setAttribute('aria-busy', 'true');
    replaceContent(view, loadingView());
    if (!id) {
      show(notFoundView(user));
      return;
    }
    try {
      // The admin endpoint also names the artist.
      const demo = user.role === 'admin' ? await getAdminDemo(id) : await getDemo(id);
      show(demoView(demo, user));
      // The <title> now names the demo; stop the language switch from resetting it.
      document.querySelector('title')?.removeAttribute('data-i18n');
      document.title = `${demo.title} · ${t('common.brand')}`;
    } catch (error) {
      const apiError = toApiError(error);
      // Someone else's demo and a missing one arrive as the same 404 and look the same here.
      show(apiError.code === 'demo.not_found' ? notFoundView(user) : errorView(apiError, load));
    }
  };

  // Only formatted values change with the language; rebuilding would also restart the player.
  onLangChange(() => localizeFormats(view));
  await load();
}

/**
 * @param {Demo | AdminDemo} demo
 * @param {User} user
 */
function demoView(demo, user) {
  // A saved status change swaps only these parts, so the player keeps playing.
  let current = demo;
  let badge = statusBadge(demo.status);
  let statusNote = statusNoteText(demo.statusNote);
  let updated = dateTime(demo.updatedAt);
  /** @param {AdminDemo} saved */
  const showSaved = (saved) => {
    current = saved;
    badge = swap(badge, statusBadge(saved.status));
    statusNote = swap(statusNote, statusNoteText(saved.statusNote));
    updated = swap(updated, dateTime(saved.updatedAt));
  };
  const statusControl =
    user.role === 'admin' &&
    h(
      'div',
      { class: 'demo-detail__review-actions' },
      statusButton(demo.title, (opener) => openStatusDialog({ demo: current, opener, onSaved: showSaved })),
    );

  const audioError = h('p', { class: 'field__error', hidden: true, i18n: 'demos.detail.audioFailed' });
  const audio = h('audio', {
    class: 'demo-audio',
    controls: true,
    preload: 'none',
    src: audioUrl(demo.id),
    'aria-labelledby': 'listen-title',
  });
  audio.addEventListener('error', () => {
    audioError.hidden = false;
  });

  return h(
    'article',
    { class: 'demo-detail', 'aria-labelledby': 'demo-title' },
    backLink(user),
    uploadNotice(uploadCheck),
    h(
      'header',
      { class: 'demo-detail__head' },
      h('p', { class: 'eyebrow', i18n: 'demos.detail.eyebrow' }),
      h('h1', { class: 'demo-detail__title', id: 'demo-title', text: demo.title }),
      badge,
    ),
    h(
      'div',
      { class: 'demo-detail__grid' },
      h(
        'div',
        { class: 'demo-detail__main' },
        section('review', 'demos.detail.review', [
          h('p', { class: 'demo-detail__label', i18n: 'demos.detail.statusNote' }),
          statusNote,
          statusControl,
        ]),
        section('listen', 'demos.detail.listen', [audio, audioError]),
        section('digest', 'demos.detail.digest', [
          h('p', { class: 'muted', i18n: 'demos.detail.digestLead' }),
          digestView(demo.file.sha256, { copyLabelKey: 'demos.detail.copyDigest' }),
          fingerprint(demo.file.sha256, { className: 'demo-detail__print', draw: true }),
          infoCard({ titleKey: 'demos.detail.whatIsThis', cards: ['sha256'] }),
        ]),
        section('verify', 'demos.detail.verify.title', [
          h('p', { class: 'muted', i18n: 'demos.detail.verify.lead' }),
          verifyFile({ expected: demo.file.sha256, labelledBy: 'verify-title' }),
        ]),
      ),
      h(
        'aside',
        { class: 'demo-detail__aside', 'aria-labelledby': 'details-title' },
        h('h2', { class: 'demo-detail__section-title', id: 'details-title', i18n: 'demos.detail.details' }),
        h(
          'dl',
          { class: 'facts' },
          'artist' in demo && fact('demos.detail.artist', h('span', { class: 'facts__wrap', text: demo.artist.displayName })),
          fact('demos.detail.genre', h('span', { i18n: `genre.${GENRES.includes(demo.genre) ? demo.genre : 'other'}` })),
          fact('demos.detail.created', dateTime(demo.createdAt)),
          fact('demos.detail.updated', updated),
          fact('demos.detail.file', h('span', { class: 'facts__wrap', text: displayFileName(demo.file.originalName) })),
          fact('demos.detail.size', h('span', { class: 'mono', 'data-bytes': demo.file.sizeBytes, text: formatBytes(demo.file.sizeBytes) })),
          fact('demos.detail.type', h('span', { class: 'mono facts__wrap', text: demo.file.contentType })),
        ),
        demo.note &&
          h(
            'div',
            { class: 'demo-detail__own-note' },
            h('p', { class: 'demo-detail__label', i18n: user.role === 'admin' ? 'demos.detail.artistNote' : 'demos.detail.note' }),
            h('p', { class: 'demo-detail__text', text: demo.note }),
          ),
      ),
    ),
  );
}

/**
 * @param {string} name
 * @param {string} titleKey
 * @param {Child[]} children
 */
function section(name, titleKey, children) {
  return h(
    'section',
    { class: 'demo-detail__section', 'aria-labelledby': `${name}-title` },
    h('h2', { class: 'demo-detail__section-title', id: `${name}-title`, i18n: titleKey }),
    children,
  );
}

/**
 * @param {string} labelKey
 * @param {Child} value
 */
function fact(labelKey, value) {
  return h('div', { class: 'facts__row' }, h('dt', { i18n: labelKey }), h('dd', {}, value));
}

/** @param {string} iso */
function dateTime(iso) {
  return h('time', { class: 'mono', datetime: iso, 'data-datetime': iso, text: formatDateTime(iso) });
}

/** @param {string | null} check */
function uploadNotice(check) {
  if (check === null) return null;
  if (check === 'mismatch') return h('p', { class: 'notice notice--warn', role: 'alert', i18n: 'demos.detail.uploadedMismatch' });
  return h('p', { class: 'notice', role: 'status', i18n: check === 'match' ? 'demos.detail.uploadedMatch' : 'demos.detail.uploaded' });
}

/** @param {string | null} note */
function statusNoteText(note) {
  return note
    ? h('p', { class: 'demo-detail__text', text: note })
    : h('p', { class: 'demo-detail__text muted', i18n: 'demos.detail.noStatusNote' });
}

/**
 * @template {Element} T
 * @param {Element} old
 * @param {T} next
 * @returns {T}
 */
function swap(old, next) {
  old.replaceWith(next);
  return next;
}

/** @param {User} user */
function backLink(user) {
  const key = user.role === 'admin' ? 'demos.detail.backAdmin' : 'demos.detail.back';
  return h('p', { class: 'demo-detail__back' }, h('a', { href: homeFor(user), i18n: key }));
}

function loadingView() {
  return [
    h(
      'div',
      { class: 'skeleton-stack', 'aria-hidden': 'true' },
      h('span', { class: 'skeleton skeleton--title' }),
      h('span', { class: 'skeleton skeleton--badge' }),
      h('span', { class: 'skeleton skeleton--block' }),
    ),
    h('p', { class: 'visually-hidden', i18n: 'demos.detail.loading' }),
  ];
}

/** @param {User} user */
function notFoundView(user) {
  return h(
    'section',
    { class: 'state-view', 'aria-labelledby': 'not-found-title' },
    h(
      'p',
      { class: 'eyebrow' },
      h('span', { class: 'eyebrow__index' }, '404'),
      h('span', { i18n: 'common.notFound.eyebrow' }),
    ),
    h('h1', { class: 'state-view__title', id: 'not-found-title', i18n: 'demos.detail.notFound.title' }),
    h('p', { class: 'state-view__body', i18n: 'demos.detail.notFound.body' }),
    h(
      'div',
      { class: 'state-view__actions' },
      h('a', {
        class: 'btn btn--primary',
        href: homeFor(user),
        i18n: user.role === 'admin' ? 'demos.detail.backAdmin' : 'demos.detail.back',
      }),
    ),
  );
}

/**
 * @param {import('../core/errors.js').ApiError} error
 * @param {() => void} retry
 */
function errorView(error, retry) {
  return h(
    'section',
    { class: 'state-view', role: 'alert' },
    h('h1', { class: 'state-view__title', i18n: 'demos.detail.loadFailed' }),
    h('p', { class: 'state-view__body', i18n: errorKey(error.code) }),
    h(
      'div',
      { class: 'state-view__actions' },
      h('button', { type: 'button', class: 'btn btn--primary', i18n: 'common.retry', on: { click: () => retry() } }),
    ),
  );
}
