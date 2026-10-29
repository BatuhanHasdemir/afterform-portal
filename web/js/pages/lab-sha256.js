// @ts-check
import { digestView } from '../components/digest.js';
import { fingerprint } from '../components/fingerprint.js';
import { LAB_TRACE_MAX_BYTES } from '../core/config.js';
import { h, icon, qs, replaceContent } from '../core/dom.js';
import { bootPage } from '../core/guard.js';
import { applyTranslations, onLangChange, t } from '../core/i18n.js';
import { bytesToHex, hex32, hex8, utf8Bytes } from '../lab/hex.js';
import { H0, K, sha256Trace } from '../lab/sha256.js';
/** @import { BlockTrace, Sha256Trace } from '../lab/sha256.js' */
/** @import { Child } from '../core/dom.js' */

const REGISTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const LAST_ROUND = 63;
const PLAY_INTERVAL_MS = 700;
const INPUT_DELAY_MS = 150;

const context = await bootPage({ access: 'public' });
if (context) {
  const input = /** @type {HTMLTextAreaElement} */ (qs('#sha-input'));
  const inputError = qs('[data-input-error]');
  const stats = qs('[data-stats]');
  const blockField = qs('[data-block-field]');
  const blockSelect = /** @type {HTMLSelectElement} */ (qs('#block'));
  const slider = /** @type {HTMLInputElement} */ (qs('#round'));
  const controls = qs('[data-round-controls]');
  const playButton = qs('[data-play]');
  const motionNote = qs('[data-motion-note]');
  const position = qs('[data-round-position]');
  const roundStatus = qs('[data-round-status]');
  const prevButton = qs('[data-step="-1"]');
  const nextButton = qs('[data-step="1"]');
  const views = {
    bytes: qs('[data-view="bytes"]'),
    padding: qs('[data-view="padding"]'),
    words: qs('[data-view="words"]'),
    schedule: qs('[data-view="schedule"]'),
    round: qs('[data-view="round"]'),
    constants: qs('[data-view="constants"]'),
    feed: qs('[data-view="feed"]'),
    digest: qs('[data-view="digest"]'),
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /** @type {Sha256Trace} */
  let trace = sha256Trace(new Uint8Array());
  let blockIndex = 0;
  let round = 0;
  let checkRun = 0;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let player;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let inputTimer;

  const limitParams = { max: LAB_TRACE_MAX_BYTES };
  for (const el of [qs('#sha-input-hint'), inputError]) {
    el.setAttribute('data-i18n-params', JSON.stringify(limitParams));
  }
  inputError.setAttribute('data-i18n', 'lab.sha256.input.tooLong');
  applyTranslations(document.body);

  const block = () => trace.blocks[blockIndex];

  const stop = () => {
    clearInterval(player);
    player = undefined;
    playButton.setAttribute('aria-pressed', 'false');
  };

  /**
   * @param {number} next
   * @param {{ announce?: boolean }} [options] silent during automatic play, which would
   *   otherwise talk over everything
   */
  const setRound = (next, { announce = true } = {}) => {
    round = Math.min(Math.max(0, next), LAST_ROUND);
    const valueText = t('lab.sha256.rounds.valueText', { round: round + 1, t: round });
    slider.value = String(round);
    slider.setAttribute('aria-valuetext', valueText);
    position.textContent = valueText;
    if (announce) roundStatus.textContent = valueText;
    toggleAttr(prevButton, 'aria-disabled', round === 0);
    toggleAttr(nextButton, 'aria-disabled', round === LAST_ROUND);
    renderRound(views.round, block(), round);
    markSchedule(views.schedule, round);
  };

  const play = () => {
    if (reducedMotion.matches) return;
    if (round === LAST_ROUND) setRound(0, { announce: false });
    playButton.setAttribute('aria-pressed', 'true');
    player = setInterval(() => {
      if (round >= LAST_ROUND) stop();
      else setRound(round + 1, { announce: false });
    }, PLAY_INTERVAL_MS);
  };

  const syncMotion = () => {
    playButton.hidden = reducedMotion.matches;
    motionNote.hidden = !reducedMotion.matches;
    if (reducedMotion.matches) stop();
  };

  const showBlock = () => {
    renderWords(views.words, block());
    renderSchedule(views.schedule, block());
    renderFeedForward(views.feed, block());
    setRound(round, { announce: false });
  };

  const compute = () => {
    const bytes = utf8Bytes(input.value);
    const tooLong = bytes.length > LAB_TRACE_MAX_BYTES;
    inputError.hidden = !tooLong;
    toggleAttr(input, 'aria-invalid', tooLong);
    if (tooLong) return;

    stop();
    trace = sha256Trace(bytes);
    blockIndex = Math.min(blockIndex, trace.blocks.length - 1);
    replaceContent(
      stats,
      unit('lab.units.bytes', bytes.length),
      unit('lab.units.bits', bytes.length * 8),
      unit('lab.units.blocks', trace.blocks.length),
    );
    renderBytes(views.bytes, bytes);
    renderPadding(views.padding, trace);
    blockField.hidden = trace.blocks.length < 2;
    blockSelect.replaceChildren(
      ...trace.blocks.map((_, i) =>
        h('option', {
          value: String(i),
          i18n: 'lab.sha256.blocks.option',
          i18nParams: { index: i + 1, count: trace.blocks.length },
        }),
      ),
    );
    blockSelect.value = String(blockIndex);
    showBlock();
    void showDigest(bytes);
  };

  /** @param {Uint8Array<ArrayBuffer>} bytes */
  const showDigest = async (bytes) => {
    const hex = bytesToHex(trace.digest);
    const status = h('p', { class: 'match', role: 'status' }, h('span', { class: 'muted', i18n: 'lab.sha256.digest.checking' }));
    replaceContent(views.digest, digestView(hex, { copyLabelKey: 'lab.sha256.digest.copy' }), status, fingerprint(hex, { className: 'lab-print' }));
    const run = ++checkRun;
    if (!globalThis.crypto?.subtle) {
      replaceContent(status, h('span', { class: 'muted', i18n: 'lab.sha256.digest.unavailable' }));
      return;
    }
    // The Lab's own implementation only explains; the reference is always the platform's.
    const reference = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    if (run !== checkRun) return;
    const ok = reference === hex;
    replaceContent(
      status,
      h(
        'span',
        { class: ['match-badge', ok ? 'match-badge--ok' : 'match-badge--bad'] },
        icon(ok ? 'status-accepted' : 'status-rejected'),
        h('span', { i18n: ok ? 'lab.sha256.digest.match' : 'lab.sha256.digest.mismatch' }),
      ),
    );
  };

  input.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(compute, INPUT_DELAY_MS);
  });
  blockSelect.addEventListener('change', () => {
    stop();
    blockIndex = Number(blockSelect.value);
    showBlock();
  });
  slider.addEventListener('input', () => {
    stop();
    setRound(Number(slider.value), { announce: false });
  });
  prevButton.addEventListener('click', () => {
    stop();
    setRound(round - 1);
  });
  nextButton.addEventListener('click', () => {
    stop();
    setRound(round + 1);
  });
  playButton.addEventListener('click', () => (player ? stop() : play()));
  // The slider already answers ←/→ and Home/End; the same keys work on the buttons beside it.
  controls.addEventListener('keydown', (event) => {
    if (event.target === slider) return;
    /** @type {Record<string, number | undefined>} */
    const targets = { ArrowLeft: round - 1, ArrowRight: round + 1, Home: 0, End: LAST_ROUND };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    stop();
    setRound(target);
  });
  reducedMotion.addEventListener('change', syncMotion);
  onLangChange(() => setRound(round, { announce: false }));

  views.constants.replaceChildren(constantsCard());
  syncMotion();
  compute();
}

/**
 * @param {string} key plural key taking {count}
 * @param {number} count
 */
function unit(key, count) {
  return h('span', { class: 'lab-stats__item', i18n: key, i18nParams: { count } });
}

/**
 * Bytes as hex pairs with real spaces between them, so a screen reader or a copy reads
 * "61 62 63" and not one long string.
 * @param {Uint8Array} bytes
 * @param {(index: number) => string} [classFor]
 */
function byteGrid(bytes, classFor) {
  return h(
    'p',
    { class: 'byte-grid', translate: 'no' },
    Array.from(bytes, (byte, i) => [h('span', { class: ['byte', classFor?.(i)] }, hex8(byte)), ' ']),
  );
}

/**
 * @param {HTMLElement} view
 * @param {Uint8Array} bytes
 */
function renderBytes(view, bytes) {
  replaceContent(view, bytes.length === 0 ? h('p', { class: 'muted', i18n: 'lab.sha256.bytes.empty' }) : byteGrid(bytes));
}

/**
 * @param {HTMLElement} view
 * @param {Sha256Trace} trace
 */
function renderPadding(view, trace) {
  const { messageBits, zeroBytes, totalBytes } = trace.padding;
  const length = messageBits / 8;
  /** @param {number} i */
  const region = (i) => {
    if (i < length) return 'byte--message';
    if (i === length) return 'byte--one';
    return i >= totalBytes - 8 ? 'byte--length' : 'byte--zero';
  };
  replaceContent(
    view,
    h(
      'ul',
      { class: 'legend', role: 'list' },
      [
        ['byte--message', 'lab.sha256.padding.legend.message'],
        ['byte--one', 'lab.sha256.padding.legend.one'],
        ['byte--zero', 'lab.sha256.padding.legend.zeros'],
        ['byte--length', 'lab.sha256.padding.legend.length'],
      ].map(([kind, key]) =>
        h('li', { class: 'legend__item' }, h('span', { class: ['legend__swatch', kind], 'aria-hidden': 'true' }), h('span', { i18n: key })),
      ),
    ),
    byteGrid(trace.padded, region),
    h(
      'dl',
      { class: 'facts facts--row' },
      fact('lab.sha256.padding.messageBits', unit('lab.units.bits', messageBits)),
      fact('lab.sha256.padding.zeroBytes', h('span', { class: 'mono', text: zeroBytes })),
      fact('lab.sha256.padding.totalBytes', unit('lab.units.bytes', totalBytes)),
    ),
  );
}

/**
 * @param {readonly number[]} words
 * @param {string} labelKey formula key taking {i}
 * @param {string} [extraClass]
 */
function wordGrid(words, labelKey, extraClass) {
  return h(
    'ol',
    { class: ['word-grid', extraClass], role: 'list', translate: 'no' },
    words.map((word, i) =>
      h(
        'li',
        { class: 'word', dataset: { index: String(i) } },
        h('span', { class: 'word__label', i18n: labelKey, i18nParams: { i } }),
        h('span', { class: 'word__value', text: hex32(word) }),
      ),
    ),
  );
}

/**
 * @param {HTMLElement} view
 * @param {BlockTrace} block
 */
function renderWords(view, block) {
  replaceContent(view, wordGrid(block.words, 'lab.formulas.word', 'word-grid--block'));
}

/**
 * @param {HTMLElement} view
 * @param {BlockTrace} block
 */
function renderSchedule(view, block) {
  replaceContent(view, wordGrid(block.schedule, 'lab.formulas.schedule', 'word-grid--schedule'));
}

/**
 * W[t] of the shown round, and for t ≥ 16 the four words it is computed from.
 * @param {HTMLElement} view
 * @param {number} t
 */
function markSchedule(view, t) {
  const sources = t >= 16 ? [t - 2, t - 7, t - 15, t - 16] : [];
  for (const cell of view.querySelectorAll('.word')) {
    const index = Number(/** @type {HTMLElement} */ (cell).dataset.index);
    cell.classList.toggle('is-current', index === t);
    cell.classList.toggle('is-source', sources.includes(index));
    toggleAttr(cell, 'aria-current', index === t);
  }
}

/**
 * @param {HTMLElement} view
 * @param {BlockTrace} block
 * @param {number} t
 */
function renderRound(view, block, t) {
  const r = block.rounds[t];
  replaceContent(
    view,
    h(
      'div',
      { class: 'round' },
      h(
        'table',
        { class: 'data-table reg-table', translate: 'no' },
        h('caption', { class: 'data-table__caption', i18n: 'lab.sha256.rounds.registers' }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col', i18n: 'lab.sha256.rounds.register' }),
            h('th', { scope: 'col', i18n: 'lab.sha256.rounds.before' }),
            h('th', { scope: 'col', i18n: 'lab.sha256.rounds.after' }),
          ),
        ),
        h(
          'tbody',
          {},
          REGISTERS.map((name, i) => {
            const fresh = i === 0 || i === 4;
            return h(
              'tr',
              { class: fresh ? 'is-fresh' : undefined },
              h('th', { scope: 'row' }, name),
              h('td', { class: 'mono' }, hex32(r.before[i])),
              h(
                'td',
                { class: 'mono' },
                hex32(r.after[i]),
                fresh && h('span', { class: 'reg-table__tag', i18n: 'lab.sha256.rounds.fresh' }),
              ),
            );
          }),
        ),
      ),
      h(
        'div',
        { class: 'round__calc' },
        h('h3', { class: 'round__calc-title', i18n: 'lab.sha256.rounds.computation' }),
        h(
          'dl',
          { class: 'formulas', translate: 'no' },
          formula('lab.formulas.S1', r.S1),
          formula('lab.formulas.Ch', r.Ch),
          formula('lab.formulas.K', r.K),
          formula('lab.formulas.W', r.W),
          formula('lab.formulas.T1', r.T1, true),
          formula('lab.formulas.S0', r.S0),
          formula('lab.formulas.Maj', r.Maj),
          formula('lab.formulas.T2', r.T2, true),
          formula('lab.formulas.a', r.after[0], true),
          formula('lab.formulas.e', r.after[4], true),
        ),
      ),
    ),
  );
}

/**
 * @param {HTMLElement} view
 * @param {BlockTrace} block
 */
function renderFeedForward(view, block) {
  const incoming = block.rounds[0].before;
  const rounds = block.rounds[LAST_ROUND].after;
  replaceContent(
    view,
    h(
      'table',
      { class: 'data-table feed-table', translate: 'no' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('td', {}),
          h('th', { scope: 'col', i18n: 'lab.sha256.feedForward.input' }),
          h('th', { scope: 'col', i18n: 'lab.sha256.feedForward.rounds' }),
          h('th', { scope: 'col', i18n: 'lab.sha256.feedForward.output' }),
        ),
      ),
      h(
        'tbody',
        {},
        REGISTERS.map((register, i) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row', i18n: 'lab.formulas.hashPlus', i18nParams: { i, register } }),
            h('td', { class: 'mono' }, hex32(incoming[i])),
            h('td', { class: 'mono' }, hex32(rounds[i])),
            h('td', { class: 'mono feed-table__out' }, hex32(block.H[i])),
          ),
        ),
      ),
    ),
  );
}

function constantsCard() {
  return h(
    'details',
    { class: 'info-card lab-constants' },
    h('summary', { class: 'info-card__summary', i18n: 'lab.sha256.constants.title' }),
    h(
      'div',
      { class: 'lab-constants__body' },
      h('p', { class: 'muted', i18n: 'lab.sha256.constants.body' }),
      h('h3', { class: 'lab-constants__title', i18n: 'lab.sha256.constants.initial' }),
      wordGrid(H0, 'lab.formulas.hash', 'word-grid--block'),
      h('h3', { class: 'lab-constants__title', i18n: 'lab.sha256.constants.roundConstants' }),
      wordGrid(K, 'lab.formulas.constant', 'word-grid--schedule'),
    ),
  );
}

/**
 * @param {string} labelKey
 * @param {Child} value
 */
function fact(labelKey, value) {
  return h('div', { class: 'facts__row' }, h('dt', { i18n: labelKey }), h('dd', {}, value));
}

/**
 * @param {string} key
 * @param {number} value
 * @param {boolean} [result] a value carried into the registers
 */
function formula(key, value, result = false) {
  return h(
    'div',
    { class: ['formulas__row', result && 'is-result'] },
    h('dt', { i18n: key }),
    h('dd', { class: 'mono' }, hex32(value)),
  );
}

/**
 * @param {Element} el
 * @param {string} name
 * @param {boolean} on
 */
function toggleAttr(el, name, on) {
  if (on) el.setAttribute(name, 'true');
  else el.removeAttribute(name);
}
