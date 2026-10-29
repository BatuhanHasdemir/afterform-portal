// @ts-check
import { h, icon } from '../core/dom.js';
/** @import { Status } from '../core/types.js' */

/** @type {Readonly<Record<Status, string>>} */
const LABEL_KEYS = Object.freeze({
  pending: 'status.pending',
  in_review: 'status.in_review',
  accepted: 'status.accepted',
  rejected: 'status.rejected',
});

/**
 * Colour, icon and text together; the colour alone never carries the meaning.
 * @param {Status} status
 */
export function statusBadge(status) {
  return h(
    'span',
    { class: ['status-badge', `status-badge--${status}`] },
    icon(`status-${status}`),
    h('span', { class: 'status-badge__label', i18n: LABEL_KEYS[status] }),
  );
}
