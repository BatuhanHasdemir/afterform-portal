// @ts-check
import { digestView } from '../components/digest.js';
import { displayFileName } from '../components/file-drop.js';
import { fingerprint } from '../components/fingerprint.js';
import { enhanceForm } from '../components/form.js';
import { glassOver } from '../components/header.js';
import { pageInfo, pager } from '../components/pager.js';
import { statusBadge } from '../components/status-badge.js';
import { showToast } from '../components/toast.js';
import { FIELD_LIMITS, GENRES, SORT_ORDERS, STATUSES } from '../core/config.js';
import { h, icon, qs, replaceContent } from '../core/dom.js';
import { errorKey, toApiError } from '../core/errors.js';
import { formatBytes, formatDateTime, formatNumber, localizeFormats } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { onLangChange, t } from '../core/i18n.js';
import { validateStatusNote } from '../core/validators.js';
import { adminListQueryString, changeStatus, listAdminDemos, readAdminListQuery } from '../services/admin.js';
import { audioUrl } from '../services/demos.js';
/** @import { AdminDemo, Page, Status } from '../core/types.js' */
/** @import { AdminListQuery } from '../services/admin.js' */
/** @import { Child } from '../core/dom.js' */

const SKELETON_ROWS = 4;

// Side by side from here on: the list on the left, the chosen demo on the right.
const WIDE = matchMedia('(min-width: 1100px)');

let decisions = 0;

/**
 * The review desk: every artist's demos with a count per status, and beside the list the demo in
 * hand, to listen to and decide on without leaving the page.
 */
const context = await bootPage({ access: 'admin' });
if (context) {
  glassOver(qs('[data-scene-head]'));
  const controls = /** @type {HTMLFormElement} */ (qs('[data-controls]'));
  const searchInput = /** @type {HTMLInputElement} */ (qs('#filter-q'));
  const sortSelect = /** @type {HTMLSelectElement} */ (qs('#filter-sort'));
  const results = qs('[data-results]');
  const summary = qs('[data-summary]');
  const heading = qs('#admin-results-title');
  const panel = qs('[data-review]');
  const stats = [...document.querySelectorAll('[data-stats] [data-status]')].filter((el) => el instanceof HTMLButtonElement);
  /** @type {AdminListQuery} */
  let query = readAdminListQuery(new URLSearchParams(location.search));
  /** @type {AbortController | null} */
  let inflight = null;
  /** @type {AdminDemo[]} */
  let items = [];
  /** @type {Map<string, HTMLLIElement>} */
  const rows = new Map();
  /** @type {string | null} */
  let selectedId = null;

  sortSelect.replaceChildren(...SORT_ORDERS.map((sort) => h('option', { value: sort, i18n: `demos.sort.${sort}` })));
  searchInput.value = query.q;
  sortSelect.value = query.sort;

  const syncStats = () => {
    for (const button of stats) button.setAttribute('aria-pressed', String((button.dataset.status || null) === query.status));
  };
  syncStats();

  const showLoading = () => {
    results.setAttribute('aria-busy', 'true');
    replaceContent(
      results,
      h(
        'ul',
        { class: 'review-list', 'aria-hidden': 'true' },
        Array.from({ length: SKELETON_ROWS }, () =>
          h(
            'li',
            { class: 'review-row review-row--skeleton' },
            h('span', { class: 'skeleton review-row__cover' }),
            h('span', { class: 'skeleton skeleton--text' }),
          ),
        ),
      ),
      h('p', { class: 'visually-hidden', i18n: 'admin.loading' }),
    );
  };

  /** @param {Page<AdminDemo>} page */
  const showPage = (page) => {
    results.removeAttribute('aria-busy');
    items = page.items;
    rows.clear();
    if (page.total === 0) {
      summary.replaceChildren();
      replaceContent(results, emptyState());
      clearReview();
      return;
    }
    const info = pageInfo(page);
    replaceContent(
      summary,
      info.pages > 1
        ? h('span', { i18n: 'demos.range', i18nParams: { from: info.from, to: info.to, total: page.total } })
        : h('span', { i18n: 'demos.count', i18nParams: { count: page.total } }),
    );
    const list = h('ul', { class: 'review-list' });
    for (const demo of items) {
      const row = reviewRow(demo, () => select(demo.id, { focus: true }));
      rows.set(demo.id, row);
      list.append(row);
    }
    replaceContent(
      results,
      list,
      pager({
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        onChange: (target) => {
          query = { ...query, page: target };
          void load({ focusResults: true });
        },
      }),
    );
    // Side by side, the desk opens on a demo rather than an empty panel; stacked, the panel waits
    // below the list until a demo is chosen.
    const keep = items.find((demo) => demo.id === selectedId);
    if (keep) select(keep.id);
    else if (WIDE.matches) select(items[0].id);
    else clearReview();
  };

  /** @param {import('../core/errors.js').ApiError} error */
  const showError = (error) => {
    results.removeAttribute('aria-busy');
    summary.replaceChildren();
    clearReview();
    replaceContent(
      results,
      h(
        'div',
        { class: 'empty-state', role: 'alert' },
        h('h3', { class: 'empty-state__title', i18n: 'admin.loadFailed' }),
        h('p', { i18n: errorKey(error.code) }),
        h('button', { type: 'button', class: 'btn btn--primary', i18n: 'common.retry', on: { click: () => void load() } }),
      ),
    );
  };

  const emptyState = () => {
    const filtered = query.status !== null || query.q !== '';
    return h(
      'div',
      { class: 'empty-state' },
      icon('tray'),
      h('h3', { class: 'empty-state__title', i18n: filtered ? 'admin.emptyFiltered.title' : 'admin.empty.title' }),
      h('p', { i18n: filtered ? 'admin.emptyFiltered.body' : 'admin.empty.body' }),
      filtered &&
        h('button', {
          type: 'button',
          class: 'btn btn--secondary',
          i18n: 'admin.emptyFiltered.action',
          on: {
            click: () => {
              searchInput.value = '';
              query = { ...query, status: null, q: '', page: 1 };
              syncStats();
              void load();
              stats[0]?.focus();
            },
          },
        }),
    );
  };

  const clearReview = () => {
    selectedId = null;
    for (const row of rows.values()) qs('.review-row__open', row).removeAttribute('aria-current');
    panel.setAttribute('data-empty', '');
    replaceContent(
      panel,
      h(
        'div',
        { class: 'review__empty' },
        icon('headphones'),
        h('p', { class: 'review__empty-title', id: 'review-title', i18n: 'admin.review.empty.title' }),
        h('p', { class: 'review__empty-body', i18n: 'admin.review.empty.body' }),
      ),
    );
  };

  /**
   * @param {string} id
   * @param {{ focus?: boolean }} [options] focus: the panel's title takes focus, as after a click
   */
  const select = (id, { focus = false } = {}) => {
    const index = items.findIndex((demo) => demo.id === id);
    if (index < 0) return;
    selectedId = id;
    for (const [rowId, row] of rows) {
      const open = qs('.review-row__open', row);
      if (rowId === id) open.setAttribute('aria-current', 'true');
      else open.removeAttribute('aria-current');
    }
    panel.removeAttribute('data-empty');
    replaceContent(
      panel,
      reviewNav(index),
      reviewBody(items[index], (saved) => {
        items[index] = saved;
        const fresh = reviewRow(saved, () => select(saved.id, { focus: true }));
        qs('.review-row__open', fresh).setAttribute('aria-current', 'true');
        rows.get(saved.id)?.replaceWith(fresh);
        rows.set(saved.id, fresh);
        void countByStatus(stats);
      }),
    );
    if (focus) {
      // Stacked, the panel is below the list: bring its top into view before moving focus.
      if (!WIDE.matches) panel.scrollIntoView({ block: 'start' });
      qs('#review-title', panel).focus({ preventScroll: !WIDE.matches });
    }
  };

  /** @param {number} index */
  const reviewNav = (index) => {
    /**
     * @param {number} target
     * @param {string} key
     * @param {string} iconName
     */
    const step = (target, key, iconName) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost review__step',
          disabled: target < 0 || target >= items.length,
          dataset: { step: iconName },
          i18nAttr: { 'aria-label': key, title: key },
          on: {
            click: () => {
              select(items[target].id);
              // The new panel has its own buttons; focus goes to the same one, or to the title
              // once the end of the list is reached.
              const again = /** @type {HTMLButtonElement | null} */ (panel.querySelector(`[data-step="${iconName}"]`));
              if (again && !again.disabled) again.focus();
              else qs('#review-title', panel).focus();
            },
          },
        },
        icon(iconName),
      );
    return h(
      'div',
      { class: 'review__nav' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost review__back',
          on: {
            click: () => {
              const open = selectedId ? rows.get(selectedId)?.querySelector('button') : null;
              open?.focus();
            },
          },
        },
        h('span', { i18n: 'admin.review.back' }),
      ),
      h('p', { class: 'review__position', i18n: 'admin.review.position', i18nParams: { index: index + 1, count: items.length } }),
      h('div', { class: 'review__steps' }, step(index - 1, 'admin.review.previous', 'arrow-left'), step(index + 1, 'admin.review.next', 'arrow-right')),
    );
  };

  /** @param {{ focusResults?: boolean }} [options] */
  const load = async ({ focusResults = false } = {}) => {
    // A newer request replaces an older one, so a slow answer can never overwrite a newer list.
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    history.replaceState(null, '', `${location.pathname}${adminListQueryString(query)}`);
    showLoading();
    try {
      const page = await listAdminDemos(query, { signal: controller.signal });
      if (page.items.length === 0 && page.total > 0 && query.page > 1) {
        // Past the last page, e.g. from an old link: show the last page instead.
        query = { ...query, page: pageInfo({ ...query, total: page.total }).pages };
        await load({ focusResults });
        return;
      }
      showPage(page);
      if (focusResults) heading.focus();
    } catch (error) {
      if (!controller.signal.aborted) showError(toApiError(error));
    }
  };

  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    query = { ...query, q: searchInput.value.trim(), page: 1 };
    void load();
  });
  sortSelect.addEventListener('change', () => {
    const sort = SORT_ORDERS.find((value) => value === sortSelect.value) ?? 'newest';
    query = { ...query, sort, page: 1 };
    void load();
  });
  for (const button of stats) {
    button.addEventListener('click', () => {
      const status = STATUSES.find((value) => value === button.dataset.status) ?? null;
      if (status === query.status) return;
      query = { ...query, status, page: 1 };
      syncStats();
      void load();
    });
  }
  // Going from stacked to side by side should not leave an empty panel beside a full list.
  WIDE.addEventListener('change', () => {
    if (WIDE.matches && !selectedId && items.length > 0) select(items[0].id);
  });
  onLangChange(() => {
    localizeFormats(results);
    localizeFormats(panel);
  });

  void countByStatus(stats);
  await load();
}

/**
 * One request per status with a single-item page: the totals are all that is needed. The counts
 * cover every demo, whatever the search says.
 * @param {HTMLButtonElement[]} stats
 */
async function countByStatus(stats) {
  await Promise.all(
    stats.map(async (button) => {
      const status = STATUSES.find((value) => value === button.dataset.status) ?? null;
      try {
        const page = await listAdminDemos({ status, q: '', sort: 'newest', page: 1, pageSize: 1 });
        qs('[data-count]', button).textContent = formatNumber(page.total);
      } catch {
        // The previous number, or the dash, stays.
      }
    }),
  );
}

/**
 * A row of the list. The whole row is one button that puts the demo on the desk; its name reads
 * the title, the artist and the status.
 * @param {AdminDemo} demo
 * @param {() => void} onOpen
 */
function reviewRow(demo, onOpen) {
  const genre = GENRES.includes(demo.genre) ? demo.genre : 'other';
  return h(
    'li',
    { class: 'review-row', dataset: { status: demo.status } },
    h(
      'button',
      { type: 'button', class: 'review-row__open', 'aria-controls': 'review-panel', on: { click: onOpen } },
      h('span', { class: 'review-row__cover', 'aria-hidden': 'true' }, fingerprint(demo.file.sha256, { className: 'review-row__print' })),
      h(
        'span',
        { class: 'review-row__body' },
        h('span', { class: 'review-row__title', text: demo.title }),
        h(
          'span',
          { class: 'review-row__meta' },
          h('span', { class: 'review-row__artist', text: demo.artist.displayName }),
          h('span', { i18n: `genre.${genre}` }),
          dateText(demo.createdAt),
        ),
      ),
      h('span', { class: 'review-row__side' }, statusBadge(demo.status)),
    ),
  );
}

/**
 * The demo in hand: who sent it, the player, the artist's note, the decision and the file.
 * A saved decision updates its own parts in place, so the player keeps playing.
 * @param {AdminDemo} demo
 * @param {(saved: AdminDemo) => void} onSaved
 */
function reviewBody(demo, onSaved) {
  const genre = GENRES.includes(demo.genre) ? demo.genre : 'other';
  const state = h('p', { class: 'review__state' });
  /** @param {AdminDemo} current */
  const showState = (current) =>
    replaceContent(
      state,
      statusBadge(current.status),
      h('span', { class: 'review__updated' }, h('span', { i18n: 'demos.updated' }), ' ', dateText(current.updatedAt)),
    );
  showState(demo);

  const audioError = h('p', { class: 'field__error', hidden: true, i18n: 'demos.detail.audioFailed' });
  const audio = h('audio', {
    class: 'review__audio',
    controls: true,
    preload: 'none',
    src: audioUrl(demo.id),
    'aria-labelledby': 'review-listen',
  });
  audio.addEventListener('error', () => {
    audioError.hidden = false;
  });

  return h(
    'div',
    { class: 'review__body' },
    h(
      'header',
      { class: 'review__head' },
      h('span', { class: 'review__cover', 'aria-hidden': 'true' }, fingerprint(demo.file.sha256, { className: 'review__print' })),
      h(
        'div',
        { class: 'review__heading' },
        h('h2', { class: 'review__title', id: 'review-title', tabindex: '-1', text: demo.title }),
        h(
          'p',
          { class: 'review__meta' },
          h('span', { class: 'review__artist' }, icon('user'), h('span', { text: demo.artist.displayName })),
          h('span', { i18n: `genre.${genre}` }),
        ),
        state,
      ),
    ),
    block('review-listen', 'admin.review.listen', [audio, audioError]),
    block('review-note', 'admin.review.artistNote', [
      demo.note
        ? h('p', { class: 'review__note', text: demo.note })
        : h('p', { class: 'review__note review__note--none', i18n: 'admin.review.noArtistNote' }),
    ]),
    block('review-decision', 'admin.review.decision', [
      decisionForm(demo, (saved) => {
        showState(saved);
        onSaved(saved);
      }),
    ]),
    block('review-file', 'admin.review.file', [
      h(
        'dl',
        { class: 'facts review__facts' },
        fact('admin.review.fileName', h('span', { class: 'review__file-name', text: displayFileName(demo.file.originalName) })),
        fact('admin.review.size', h('span', { 'data-bytes': demo.file.sizeBytes, text: formatBytes(demo.file.sizeBytes) })),
        fact('admin.review.sent', dateTime(demo.createdAt)),
      ),
      h('p', { class: 'review__label', i18n: 'admin.review.digest' }),
      digestView(demo.file.sha256, { copyLabelKey: 'demos.detail.copyDigest' }),
    ]),
    h(
      'a',
      { class: 'review__page', href: `/portal/demo.html?id=${encodeURIComponent(demo.id)}` },
      h('span', { i18n: 'admin.review.openPage' }),
      icon('arrow-up-right'),
    ),
  );
}

/**
 * The four statuses as one choice and a note to the artist. The note starts empty on purpose:
 * a new decision gets its own note, and an empty one clears the previous note (API §7).
 * @param {AdminDemo} demo
 * @param {(saved: AdminDemo) => void} onSaved
 */
function decisionForm(demo, onSaved) {
  decisions += 1;
  const ids = {
    note: `decision-note-${decisions}`,
    hint: `decision-hint-${decisions}`,
    replaces: `decision-replaces-${decisions}`,
  };
  let current = demo;

  const radios = STATUSES.map((status) => h('input', { type: 'radio', class: 'decision__input', name: 'status', value: status }));
  const nowTags = STATUSES.map(() => h('span', { class: 'decision__now', i18n: 'admin.review.now' }));
  const currentNote = h('div', { class: 'decision__current' });
  const textarea = h('textarea', { class: 'textarea', id: ids.note, name: 'statusNote', rows: 3 });

  const form = h(
    'form',
    { class: 'decision' },
    h(
      'fieldset',
      { class: 'decision__choices' },
      h('legend', { class: 'visually-hidden', i18n: 'admin.review.decision' }),
      STATUSES.map((status, i) =>
        h(
          'label',
          { class: ['decision__option', `decision__option--${status}`] },
          radios[i],
          h('span', { class: 'decision__face' }, icon(`status-${status}`), h('span', { i18n: `status.${status}` }), nowTags[i]),
        ),
      ),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', for: ids.note, i18n: 'admin.statusDialog.note' }),
      h('p', { class: 'field__hint', id: ids.hint, i18n: 'admin.statusDialog.noteHint' }),
      currentNote,
      textarea,
    ),
    h(
      'div',
      { class: 'decision__actions' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, icon('status-accepted'), h('span', { i18n: 'admin.review.submit' })),
    ),
  );

  const sync = () => {
    radios.forEach((radio, i) => {
      radio.checked = STATUSES[i] === current.status;
      nowTags[i].hidden = STATUSES[i] !== current.status;
    });
    replaceContent(
      currentNote,
      current.statusNote &&
        h(
          'div',
          { class: 'decision__current-note' },
          h('p', { class: 'decision__current-label' }, icon('note'), h('span', { i18n: 'admin.statusDialog.currentNote' })),
          h('p', { class: 'decision__current-text', text: current.statusNote }),
          h('p', { class: 'field__hint', id: ids.replaces, i18n: 'admin.statusDialog.noteReplaces' }),
        ),
    );
    textarea.setAttribute('aria-describedby', current.statusNote ? `${ids.hint} ${ids.replaces}` : ids.hint);
    textarea.value = '';
  };
  sync();

  // The form gets its parent first: enhanceForm puts the error summary and alert in front of it.
  const wrap = h('div', { class: 'decision__wrap' }, form);
  enhanceForm(form, {
    repeatable: true,
    fields: {
      statusNote: { validate: (value) => validateStatusNote(value), limits: FIELD_LIMITS.statusNote },
    },
    async submit(values) {
      const chosen = radios.find((radio) => radio.checked)?.value;
      const status = /** @type {Status} */ (STATUSES.find((value) => value === chosen) ?? current.status);
      const saved = await changeStatus(current.id, { status, statusNote: values.statusNote });
      current = saved;
      sync();
      onSaved(saved);
      showToast(t('admin.statusSaved', { title: saved.title, status: t(`status.${saved.status}`) }), { tone: 'ok' });
    },
  });
  return wrap;
}

/**
 * @param {string} id
 * @param {string} titleKey
 * @param {Child[]} content
 */
function block(id, titleKey, content) {
  return h(
    'section',
    { class: 'review__block', 'aria-labelledby': id },
    h('h3', { class: 'review__block-title', id, i18n: titleKey }),
    content,
  );
}

/**
 * @param {string} key
 * @param {Node} value
 */
function fact(key, value) {
  return h('div', { class: 'facts__row' }, h('dt', { i18n: key }), h('dd', {}, value));
}

/** @param {string} iso */
function dateText(iso) {
  return h('time', {
    datetime: iso,
    'data-datetime': iso,
    'data-datetime-style': 'date',
    text: formatDateTime(iso, { dateStyle: 'medium' }),
  });
}

/** @param {string} iso */
function dateTime(iso) {
  return h('time', { datetime: iso, 'data-datetime': iso, text: formatDateTime(iso) });
}
