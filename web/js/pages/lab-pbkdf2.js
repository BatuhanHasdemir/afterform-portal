// @ts-check
import { groupHex } from '../components/digest.js';
import { setBusy } from '../components/form.js';
import { PBKDF2_PROJECT_ITERATIONS } from '../core/config.js';
import { h, icon, qs, replaceContent, s } from '../core/dom.js';
import { formatDuration, formatNumber } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { onLangChange, t } from '../core/i18n.js';
import { bytesToHex } from '../lab/hex.js';
import { SLIDER_STEPS, derive, iterationsAt, positionOf, randomSalt } from '../lab/pbkdf2.js';

const SERIES = [1_000, 10_000, 100_000, PBKDF2_PROJECT_ITERATIONS, 500_000, 1_000_000];
const PASSWORD_DELAY_MS = 400;
const SLIDER_DELAY_MS = 250;

/** @typedef {'a' | 'b'} RecordId */
/** @typedef {{ iterations: number, ms: number }} Measurement */

const context = await bootPage({ access: 'public' });
if (context) {
  const password = /** @type {HTMLInputElement} */ (qs('#pb-password'));
  const slider = /** @type {HTMLInputElement} */ (qs('#pb-iterations'));
  const value = qs('[data-iterations-value]');
  const projectButton = qs('[data-project]');
  const records = qs('[data-records]');
  const verdict = qs('[data-verdict]');
  const measureButton = qs('[data-measure]');
  const measureStatus = qs('[data-measure-status]');
  const chart = qs('[data-chart]');
  const plot = qs('[data-chart-plot]');
  const tableRows = qs('[data-chart-rows]');

  const projectPosition = positionOf(PBKDF2_PROJECT_ITERATIONS);
  slider.max = String(SLIDER_STEPS);
  slider.value = String(projectPosition);
  qs('[data-project-tick]').setAttribute('value', String(projectPosition));
  qs('[data-project-mark]').style.setProperty('left', `${(projectPosition / SLIDER_STEPS) * 100}%`);

  /** @type {Record<RecordId, Uint8Array<ArrayBuffer>>} */
  const salts = { a: randomSalt(), b: randomSalt() };
  /** @type {Partial<Record<RecordId, number>>} */
  const durations = {};
  /** @type {Measurement[]} */
  let measurements = [];
  let run = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let computeTimer;

  const iterations = () => iterationsAt(Number(slider.value));
  /** @param {RecordId} id */
  const recordEl = (id) => qs(`[data-record="${id}"]`);

  const showLabels = () => {
    const text = t('lab.pbkdf2.iterationsValue', { value: formatNumber(iterations()) });
    value.textContent = text;
    slider.setAttribute('aria-valuetext', text);
    projectButton.textContent = t('lab.pbkdf2.projectButton', { value: formatNumber(PBKDF2_PROJECT_ITERATIONS) });
    value.classList.toggle('is-project', iterations() === PBKDF2_PROJECT_ITERATIONS);
    for (const id of /** @type {RecordId[]} */ (['a', 'b'])) {
      const ms = durations[id];
      qs('[data-duration]', recordEl(id)).textContent = ms === undefined ? '' : formatDuration(ms);
    }
  };

  /** @param {RecordId} id */
  const showSalt = (id) => hexInto(qs('[data-salt]', recordEl(id)), bytesToHex(salts[id]));

  const compute = async () => {
    // Each run replaces the one before; a slower, older result is dropped when it arrives.
    const current = ++run;
    records.setAttribute('aria-busy', 'true');
    replaceContent(verdict, h('span', { class: 'muted', i18n: 'lab.pbkdf2.computing' }));
    try {
      /** @type {Partial<Record<RecordId, string>>} */
      const outputs = {};
      for (const id of /** @type {RecordId[]} */ (['a', 'b'])) {
        const result = await derive({ password: password.value, salt: salts[id], iterations: iterations() });
        if (current !== run) return;
        outputs[id] = bytesToHex(result.bytes);
        durations[id] = result.ms;
        hexInto(qs('[data-output]', recordEl(id)), outputs[id]);
      }
      showLabels();
      const differ = outputs.a !== outputs.b;
      replaceContent(
        verdict,
        h(
          'span',
          { class: ['match-badge', differ ? 'match-badge--ok' : 'match-badge--bad'] },
          icon(differ ? 'status-accepted' : 'warning'),
          h('span', { i18n: differ ? 'lab.pbkdf2.different' : 'lab.pbkdf2.same' }),
        ),
      );
    } catch {
      if (current === run) {
        replaceContent(verdict, h('span', { i18n: globalThis.crypto?.subtle ? 'lab.pbkdf2.failed' : 'lab.pbkdf2.unavailable' }));
      }
    } finally {
      if (current === run) records.removeAttribute('aria-busy');
    }
  };

  /** @param {number} delay */
  const computeSoon = (delay) => {
    clearTimeout(computeTimer);
    computeTimer = setTimeout(() => void compute(), delay);
  };

  const measure = async () => {
    if (measureButton.getAttribute('aria-busy') === 'true') return;
    setBusy(measureButton, true);
    measurements = [];
    chart.hidden = false;
    try {
      for (const [index, count] of SERIES.entries()) {
        measureStatus.textContent = t('lab.pbkdf2.measuring', { done: index, total: SERIES.length });
        const { ms } = await derive({ password: password.value, salt: salts.a, iterations: count });
        measurements.push({ iterations: count, ms });
        drawChart(plot, measurements);
        fillTable(tableRows, measurements);
      }
      measureStatus.textContent = t('lab.pbkdf2.measured');
    } catch {
      measureStatus.textContent = t('lab.pbkdf2.failed');
    } finally {
      setBusy(measureButton, false);
    }
  };

  password.addEventListener('input', () => computeSoon(PASSWORD_DELAY_MS));
  slider.addEventListener('input', showLabels);
  slider.addEventListener('change', () => computeSoon(SLIDER_DELAY_MS));
  projectButton.addEventListener('click', () => {
    slider.value = String(projectPosition);
    showLabels();
    computeSoon(0);
  });
  for (const id of /** @type {RecordId[]} */ (['a', 'b'])) {
    qs('[data-new-salt]', recordEl(id)).addEventListener('click', () => {
      salts[id] = randomSalt();
      showSalt(id);
      computeSoon(0);
    });
  }
  measureButton.addEventListener('click', () => void measure());
  new ResizeObserver(() => {
    if (measurements.length > 0) drawChart(plot, measurements);
  }).observe(plot);
  onLangChange(() => {
    showLabels();
    if (measurements.length > 0) {
      drawChart(plot, measurements);
      fillTable(tableRows, measurements);
    }
  });

  showSalt('a');
  showSalt('b');
  showLabels();
  await compute();
}

/**
 * @param {Element} el
 * @param {string} hex
 */
function hexInto(el, hex) {
  replaceContent(el, groupHex(hex).map((group) => h('span', { class: 'digest__group' }, group)));
}

/**
 * Horizontal bars, one per measured iteration count, drawn at the container's real width so
 * the text keeps its size. The project setting is the one bar in the accent colour, and it is
 * also named in text right above its bar, so colour is never the only signal.
 * @param {HTMLElement} container
 * @param {Measurement[]} rows
 */
function drawChart(container, rows) {
  const width = Math.max(200, Math.floor(container.clientWidth));
  const labelWidth = 84;
  // Room for the longest value label ("1,23 sn", "1.23 sec") after the longest bar.
  const valueRoom = 84;
  const rowHeight = 32;
  const tagHeight = 18;
  const barHeight = 18;
  const plotWidth = width - labelWidth - valueRoom;
  const longest = Math.max(...rows.map((row) => row.ms), 1);

  let top = 0;
  const groups = rows.map((row) => {
    const project = row.iterations === PBKDF2_PROJECT_ITERATIONS;
    if (project) top += tagHeight;
    const y = top + (rowHeight - barHeight) / 2;
    const length = Math.max(2, (row.ms / longest) * plotWidth);
    top += rowHeight;
    return s(
      'g',
      { class: ['cost-chart__row', project && 'is-project'] },
      s('title', {}, `${formatNumber(row.iterations)} · ${formatDuration(row.ms)}`),
      project && s('text', { class: 'cost-chart__tag', x: labelWidth + 1, y: y - 6 }, t('lab.pbkdf2.projectSetting')),
      s('text', { class: 'cost-chart__label', x: labelWidth - 8, y: y + barHeight / 2, 'text-anchor': 'end', 'dominant-baseline': 'central' }, formatNumber(row.iterations)),
      s('path', { class: 'cost-chart__bar', d: barPath(labelWidth + 1, y, length, barHeight, 4) }),
      s('text', { class: 'cost-chart__value', x: labelWidth + 1 + length + 6, y: y + barHeight / 2, 'dominant-baseline': 'central' }, formatDuration(row.ms)),
    );
  });

  replaceContent(
    container,
    s(
      'svg',
      {
        class: 'cost-chart__svg',
        width,
        height: top,
        viewBox: `0 0 ${width} ${top}`,
        role: 'img',
        'aria-labelledby': 'pb-chart-title',
      },
      s('line', { class: 'cost-chart__baseline', x1: labelWidth, x2: labelWidth, y1: 0, y2: top }),
      groups,
    ),
  );
}

/**
 * A bar square at the baseline with a 4px rounded data end.
 * @param {number} x
 * @param {number} y
 * @param {number} length
 * @param {number} height
 * @param {number} radius
 */
function barPath(x, y, length, height, radius) {
  const r = Math.min(radius, length / 2, height / 2);
  const end = x + length;
  return `M${x},${y}H${end - r}A${r},${r} 0 0 1 ${end},${y + r}V${y + height - r}A${r},${r} 0 0 1 ${end - r},${y + height}H${x}Z`;
}

/**
 * @param {HTMLElement} body
 * @param {Measurement[]} rows
 */
function fillTable(body, rows) {
  replaceContent(
    body,
    rows.map((row) =>
      h(
        'tr',
        { class: row.iterations === PBKDF2_PROJECT_ITERATIONS ? 'is-project' : undefined },
        h('td', { class: 'mono' }, formatNumber(row.iterations)),
        h('td', { class: 'mono' }, formatDuration(row.ms)),
      ),
    ),
  );
}
