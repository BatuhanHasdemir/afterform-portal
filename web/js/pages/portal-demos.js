// @ts-check
import { fingerprint } from '../components/fingerprint.js';
import { pageInfo, pager } from '../components/pager.js';
import { statusBadge } from '../components/status-badge.js';
import { GENRES, SORT_ORDERS, STATUSES } from '../core/config.js';
import { h, qs, replaceContent } from '../core/dom.js';
import { errorKey, toApiError } from '../core/errors.js';
import { formatBytes, formatDateTime, localizeFormats } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { onLangChange } from '../core/i18n.js';
import { listDemos, listQueryString, readListQuery } from '../services/demos.js';
/** @import { Demo, Page } from '../core/types.js' */
/** @import { ListQuery } from '../services/demos.js' */

const SKELETON_CARDS = 3;

const context = await bootPage({ access: 'artist' });
if (context) {
  const statusSelect = /** @type {HTMLSelectElement} */ (qs('#filter-status'));
  const sortSelect = /** @type {HTMLSelectElement} */ (qs('#filter-sort'));
  const results = qs('[data-results]');
  const summary = qs('[data-summary]');
  const heading = qs('#demos-results-title');
  /** @type {ListQuery} */
  let query = readListQuery(new URLSearchParams(location.search));
  /** @type {AbortController | null} */
  let inflight = null;

  statusSelect.replaceChildren(
    h('option', { value: '', i18n: 'demos.filters.all' }),
    ...STATUSES.map((status) => h('option', { value: status, i18n: `status.${status}` })),
  );
  sortSelect.replaceChildren(...SORT_ORDERS.map((sort) => h('option', { value: sort, i18n: `demos.sort.${sort}` })));
  statusSelect.value = query.status ?? '';
  sortSelect.value = query.sort;

  const showLoading = () => {
    results.setAttribute('aria-busy', 'true');
    replaceContent(
      results,
      h(
        'ul',
        { class: 'demo-list', 'aria-hidden': 'true' },
        Array.from({ length: SKELETON_CARDS }, () =>
          h(
            'li',
            { class: 'demo-card demo-card--skeleton' },
            h('span', { class: 'skeleton skeleton--title' }),
            h('span', { class: 'skeleton skeleton--text' }),
          ),
        ),
      ),
      h('p', { class: 'visually-hidden', i18n: 'demos.loading' }),
    );
  };

  /** @param {Page<Demo>} page */
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
      h('ul', { class: 'demo-list', role: 'list' }, page.items.map(demoCard)),
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
        h('h3', { class: 'empty-state__title', i18n: 'demos.loadFailed' }),
        h('p', { i18n: errorKey(error.code) }),
        h('button', { type: 'button', class: 'btn btn--primary', i18n: 'common.retry', on: { click: () => void load() } }),
      ),
    );
  };

  const emptyState = () => {
    const filtered = query.status !== null;
    return h(
      'div',
      { class: 'empty-state' },
      h('h3', { class: 'empty-state__title', i18n: filtered ? 'demos.emptyFiltered.title' : 'demos.empty.title' }),
      h('p', { i18n: filtered ? 'demos.emptyFiltered.body' : 'demos.empty.body' }),
      filtered
        ? h('button', {
            type: 'button',
            class: 'btn btn--secondary',
            i18n: 'demos.emptyFiltered.action',
            on: {
              click: () => {
                statusSelect.value = '';
                query = { ...query, status: null, page: 1 };
                void load();
                statusSelect.focus();
              },
            },
          })
        : h('a', { class: 'btn btn--primary', href: '/portal/upload.html', i18n: 'demos.empty.action' }),
    );
  };

  /** @param {{ focusResults?: boolean }} [options] */
  const load = async ({ focusResults = false } = {}) => {
    // A newer request replaces an older one, so a slow answer can never overwrite a newer list.
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    history.replaceState(null, '', `${location.pathname}${listQueryString(query)}`);
    showLoading();
    try {
      const page = await listDemos(query, { signal: controller.signal });
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
  qs('[data-controls]').addEventListener('submit', (event) => event.preventDefault());
  onLangChange(() => localizeFormats(results));

  await load();
}

/** @param {Demo} demo */
function demoCard(demo) {
  const genre = GENRES.includes(demo.genre) ? demo.genre : 'other';
  return h(
    'li',
    { class: 'demo-card' },
    h(
      'div',
      { class: 'demo-card__body' },
      h(
        'h3',
        { class: 'demo-card__title' },
        h('a', { class: 'demo-card__link', href: `/portal/demo.html?id=${encodeURIComponent(demo.id)}`, text: demo.title }),
      ),
      h(
        'p',
        { class: 'demo-card__meta' },
        h('span', { i18n: `genre.${genre}` }),
        h('time', {
          datetime: demo.createdAt,
          'data-datetime': demo.createdAt,
          'data-datetime-style': 'date',
          text: formatDateTime(demo.createdAt, { dateStyle: 'medium' }),
        }),
        h('span', { 'data-bytes': demo.file.sizeBytes, text: formatBytes(demo.file.sizeBytes) }),
      ),
    ),
    statusBadge(demo.status),
    fingerprint(demo.file.sha256, { className: 'demo-card__print' }),
  );
}
