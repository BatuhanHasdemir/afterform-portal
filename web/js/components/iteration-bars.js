// @ts-check
import { PBKDF2_PROJECT_ITERATIONS } from '../core/config.js';
import { h } from '../core/dom.js';
import { formatNumber } from '../core/format.js';
import { onLangChange } from '../core/i18n.js';

/** Iteration counts to set the project's value against. */
export const ITERATION_STEPS = Object.freeze([10_000, 100_000, PBKDF2_PROJECT_ITERATIONS, 1_000_000]);

/**
 * Iteration counts as bars on a linear scale: the work of one guess grows in proportion to the
 * count, so the bar lengths are the cost. The project's setting is the one bar in the accent.
 * The numbers are text, so the list reads the same without the bars. The bars grow in when an
 * ancestor gets data-inview.
 * @param {{ values?: readonly number[], compact?: boolean }} [options]
 */
export function iterationBars({ values = ITERATION_STEPS, compact = false } = {}) {
  const max = Math.max(...values);
  const rows = values.map((value) => {
    const project = value === PBKDF2_PROJECT_ITERATIONS;
    const bar = h('span', { class: 'iter-bars__bar', 'aria-hidden': 'true' });
    bar.style.setProperty('--share', String(value / max));
    const number = h('span', { class: 'iter-bars__value', 'data-number': value, text: formatNumber(value) });
    return h(
      'li',
      { class: ['iter-bars__row', project && 'is-project'] },
      number,
      bar,
      project && h('span', { class: 'iter-bars__tag', i18n: 'lab.pbkdf2.projectSetting' }),
    );
  });
  const list = h('ol', { class: ['iter-bars', compact && 'iter-bars--compact'], role: 'list' }, rows);
  onLangChange(() => {
    for (const number of list.querySelectorAll('[data-number]')) number.textContent = formatNumber(Number(number.getAttribute('data-number')));
  });
  return list;
}
