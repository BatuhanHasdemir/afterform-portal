// @ts-check
import { pageInfo, pager } from '../components/pager.js';
import { statusBadge } from '../components/status-badge.js';
import { openStatusDialog, statusButton } from '../components/status-control.js';
import { GENRES, SORT_ORDERS, STATUSES } from '../core/config.js';
import { h, qs, replaceContent } from '../core/dom.js';
import { errorKey, toApiError } from '../core/errors.js';
import { formatDateTime, localizeFormats } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { onLangChange } from '../core/i18n.js';
import { adminListQueryString, listAdminDemos, readAdminListQuery } from '../services/admin.js';
/** @import { AdminDemo, Page } from '../core/types.js' */
/** @import { AdminListQuery } from '../services/admin.js' */

const SKELETON_ROWS = 4;

const COLUMNS = /** @type {const} */ (['title', 'artist', 'genre', 'created', 'status', 'actions']);

const context = await bootPage({ access: 'admin' });
if (context) {
  const controls = /** @type {HTMLFormElement} */ (qs('[data-controls]'));
  const searchInput = /** @type {HTMLInputElement} */ (qs('#filter-q'));
  const statusSelect = /** @type {HTMLSelectElement} */ (qs('#filter-status'));
  const sortSelect = /** @type {HTMLSelectElement} */ (qs('#filter-sort'));
  const results = qs('[data-results]');
  const summary = qs('[data-summary]');
  const heading = qs('#admin-results-title');
  /** @type {AdminListQuery} */
  let query = readAdminListQuery(new URLSearchParams(location.search));
  /** @type {AbortController | null} */
  let inflight = null;

  statusSelect.replaceChildren(
    h('option', { value: '', i18n: 'demos.filters.all' }),
    ...STATUSES.map((status) => h('option', { value: status, i18n: `status.${status}` })),
  );
  sortSelect.replaceChildren(...SORT_ORDERS.map((sort) => h('option', { value: sort, i18n: `demos.sort.${sort}` })));
  searchInput.value = query.q;
  statusSelect.value = query.status ?? '';
  sortSelect.value = query.sort;

  const showLoading = () => {
    results.setAttribute('aria-busy', 'true');
    replaceContent(
      results,
      h(
        'div',
        { class: 'admin-skeleton', 'aria-hidden': 'true' },
        Array.from({ length: SKELETON_ROWS }, () => h('span', { class: 'skeleton admin-skeleton__row' })),
      ),
      h('p', { class: 'visually-hidden', i18n: 'admin.loading' }),
    );
  };

  /** @param {Page<AdminDemo>} page */
  const showPage = (page) => {
    results.removeAttribute('aria-busy');
    if (page.total === 0) {
      summary.replaceChildren();
      replaceContent(results, emptyState());
      return;
    }
    const info = pageInfo(page);
    replaceContent(
      summary,
      info.pages > 1
        ? h('span', { i18n: 'demos.range', i18nParams: { from: info.from, to: info.to, total: page.total } })
        : h('span', { i18n: 'demos.count', i18nParams: { count: page.total } }),
    );
    replaceContent(
      results,
      demoTable(page.items),
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
  };

  /** @param {import('../core/errors.js').ApiError} error */
  const showError = (error) => {
    results.removeAttribute('aria-busy');
    summary.replaceChildren();
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
              statusSelect.value = '';
              query = { ...query, status: null, q: '', page: 1 };
              void load();
              searchInput.focus();
            },
          },
        }),
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
  statusSelect.addEventListener('change', () => {
    const status = STATUSES.find((value) => value === statusSelect.value) ?? null;
    query = { ...query, status, page: 1 };
    void load();
  });
  sortSelect.addEventListener('change', () => {
    const sort = SORT_ORDERS.find((value) => value === sortSelect.value) ?? 'newest';
    query = { ...query, sort, page: 1 };
    void load();
  });
  onLangChange(() => localizeFormats(results));

  await load();
}

/**
 * A real table, with roles spelled out: below 1100px its rows are restyled as stacked cards,
 * and some browsers drop the table semantics once the display type changes.
 * @param {AdminDemo[]} items
 */
function demoTable(items) {
  return h(
    'table',
    { class: 'admin-table', role: 'table', 'aria-labelledby': 'admin-results-title' },
    h(
      'thead',
      { role: 'rowgroup' },
      h(
        'tr',
        { role: 'row' },
        COLUMNS.map((column) =>
          h('th', {
            scope: 'col',
            role: 'columnheader',
            class: column === 'actions' ? 'admin-table__actions' : undefined,
            i18n: `admin.columns.${column}`,
          }),
        ),
      ),
    ),
    h('tbody', { role: 'rowgroup' }, items.map(demoRow)),
  );
}

/** @param {AdminDemo} demo */
function demoRow(demo) {
  let current = demo;
  const genre = GENRES.includes(demo.genre) ? demo.genre : 'other';
  const statusCell = cell('status', statusBadge(demo.status));
  const button = statusButton(demo.title, (opener) =>
    openStatusDialog({
      demo: current,
      opener,
      onSaved: (saved) => {
        current = saved;
        statusCell.replaceChildren(statusBadge(saved.status));
      },
    }),
  );

  return h(
    'tr',
    { role: 'row' },
    h(
      'th',
      { scope: 'row', role: 'rowheader', class: 'admin-table__title' },
      h('a', { href: `/portal/demo.html?id=${encodeURIComponent(demo.id)}`, text: demo.title }),
    ),
    cell('artist', h('span', { text: demo.artist.displayName })),
    cell('genre', h('span', { i18n: `genre.${genre}` })),
    cell(
      'created',
      h('time', {
        class: 'mono',
        datetime: demo.createdAt,
        'data-datetime': demo.createdAt,
        'data-datetime-style': 'date',
        text: formatDateTime(demo.createdAt, { dateStyle: 'medium' }),
      }),
    ),
    statusCell,
    h('td', { role: 'cell', class: 'admin-table__actions' }, button),
  );
}

/**
 * The column name rides along as data-label for the stacked layout, where the header row is
 * hidden; the stylesheet shows it without letting screen readers read it a second time.
 * @param {(typeof COLUMNS)[number]} column
 * @param {Node} content
 */
function cell(column, content) {
  return h('td', { role: 'cell', i18nAttr: { 'data-label': `admin.columns.${column}` } }, content);
}
