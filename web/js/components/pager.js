// @ts-check
import { h } from '../core/dom.js';

/**
 * @param {{ page: number, pageSize: number, total: number }} state
 */
export function pageInfo({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return {
    page: current,
    pages,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(total, current * pageSize),
    hasPrev: current > 1,
    hasNext: current < pages,
  };
}

/**
 * Previous and next around the current position; nothing at all when one page holds everything.
 * Inactive ends use aria-disabled so focus stays on the button when the last page is reached.
 * @param {{ page: number, pageSize: number, total: number, onChange: (page: number) => void }} options
 * @returns {HTMLElement | null}
 */
export function pager({ page, pageSize, total, onChange }) {
  const info = pageInfo({ page, pageSize, total });
  if (info.pages <= 1) return null;

  /**
   * @param {string} key
   * @param {number} target
   * @param {boolean} enabled
   */
  const step = (key, target, enabled) =>
    h('button', {
      type: 'button',
      class: 'btn btn--secondary pager__button',
      'aria-disabled': enabled ? null : 'true',
      i18n: key,
      on: {
        click: () => {
          if (enabled) onChange(target);
        },
      },
    });

  return h(
    'nav',
    { class: 'pager', i18nAttr: { 'aria-label': 'common.pager.label' } },
    step('common.pager.previous', info.page - 1, info.hasPrev),
    h('p', {
      class: 'pager__status',
      i18n: 'common.pager.status',
      i18nParams: { page: info.page, pages: info.pages },
    }),
    step('common.pager.next', info.page + 1, info.hasNext),
  );
}
