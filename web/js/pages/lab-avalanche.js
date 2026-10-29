// @ts-check
import { groupHex } from '../components/digest.js';
import { fingerprint } from '../components/fingerprint.js';
import { LAB_TRACE_MAX_BYTES } from '../core/config.js';
import { h, qs, replaceContent } from '../core/dom.js';
import { formatPercent } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { applyTranslations, onLangChange, t } from '../core/i18n.js';
import { algorithmById, webCryptoAlgorithms } from '../lab/algorithms.js';
import { bitAt, diffBits, flipBit } from '../lab/bits.js';
import { binary8, bytesToHex, hex8, utf8Bytes } from '../lab/hex.js';

const INPUT_DELAY_MS = 150;
// A flipped bit can leave invalid UTF-8 behind; the decoder shows that as U+FFFD instead of failing.
const decoder = new TextDecoder();

const context = await bootPage({ access: 'public' });
if (context) {
  const input = /** @type {HTMLTextAreaElement} */ (qs('#av-input'));
  const inputError = qs('[data-input-error]');
  const algorithmSelect = /** @type {HTMLSelectElement} */ (qs('#av-algorithm'));
  const slider = /** @type {HTMLInputElement} */ (qs('#av-bit'));
  const bitValue = qs('[data-bit-value]');
  const empty = qs('[data-empty]');
  const experiment = qs('[data-experiment]');
  const inputsView = qs('[data-inputs]');
  const resultView = qs('[data-result]');
  const digestsView = qs('[data-digests]');
  const gridView = qs('[data-grid]');
  const printsView = qs('[data-prints]');

  inputError.setAttribute('data-i18n', 'lab.avalanche.tooLong');
  inputError.setAttribute('data-i18n-params', JSON.stringify({ max: LAB_TRACE_MAX_BYTES }));
  applyTranslations(inputError);
  algorithmSelect.replaceChildren(
    ...webCryptoAlgorithms().map((algorithm) => h('option', { value: algorithm.id, text: algorithm.name })),
  );
  algorithmSelect.value = 'sha256';

  /** Bit to flip; -1 picks the last bit of the input, whose change is easiest to read in text. */
  let bit = -1;
  let run = 0;
  /** @type {{ a: Uint8Array, b: Uint8Array } | null} */
  let last = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let inputTimer;

  const update = async () => {
    const bytes = utf8Bytes(input.value);
    const tooLong = bytes.length > LAB_TRACE_MAX_BYTES;
    inputError.hidden = !tooLong;
    toggleAttr(input, 'aria-invalid', tooLong);
    if (tooLong) return;
    empty.hidden = bytes.length > 0;
    experiment.hidden = bytes.length === 0;
    slider.disabled = bytes.length === 0;
    if (bytes.length === 0) return;

    const maxBit = bytes.length * 8 - 1;
    if (bit < 0 || bit > maxBit) bit = maxBit;
    slider.max = String(maxBit);
    slider.value = String(bit);
    const label = t('lab.avalanche.bitValue', { byte: bit >> 3, bit: bit & 7 });
    slider.setAttribute('aria-valuetext', label);
    bitValue.textContent = label;

    const flipped = flipBit(bytes, bit);
    renderInputs(inputsView, bytes, flipped, bit);

    const algorithm = algorithmById(algorithmSelect.value) ?? webCryptoAlgorithms()[1];
    const current = ++run;
    if (!globalThis.crypto?.subtle || !algorithm.webCrypto) {
      replaceContent(resultView, h('span', { i18n: 'lab.avalanche.unavailable' }));
      return;
    }
    const name = algorithm.webCrypto;
    const [a, b] = await Promise.all([crypto.subtle.digest(name, bytes), crypto.subtle.digest(name, flipped)]);
    if (current !== run) return;
    last = { a: new Uint8Array(a), b: new Uint8Array(b) };
    renderResult();
  };

  const renderResult = () => {
    if (!last) return;
    const { a, b } = last;
    const { xor, changed } = diffBits(a, b);
    const total = a.length * 8;
    replaceContent(
      resultView,
      h('span', {
        i18n: 'lab.avalanche.changed',
        i18nParams: { count: changed, total, percent: formatPercent(changed / total, 1) },
      }),
    );
    replaceContent(
      digestsView,
      digestRow('lab.avalanche.digestA', bytesToHex(a)),
      digestRow('lab.avalanche.digestB', bytesToHex(b)),
      digestRow('lab.avalanche.xor', bytesToHex(xor)),
    );
    replaceContent(
      gridView,
      Array.from({ length: total }, (_, i) => h('span', { class: ['bit-grid__cell', bitAt(xor, i) === 1 && 'is-changed'] })),
    );
    replaceContent(
      printsView,
      h('figure', { class: 'av-print' }, fingerprint(bytesToHex(a)), h('figcaption', { i18n: 'lab.avalanche.digestA' })),
      h('figure', { class: 'av-print' }, fingerprint(bytesToHex(b)), h('figcaption', { i18n: 'lab.avalanche.digestB' })),
    );
  };

  input.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => void update(), INPUT_DELAY_MS);
  });
  slider.addEventListener('input', () => {
    bit = Number(slider.value);
    void update();
  });
  algorithmSelect.addEventListener('change', () => void update());
  qs('[data-random]').addEventListener('click', () => {
    const count = Number(slider.max) + 1;
    if (count < 2) return;
    // Any bit but the current one, so the button always shows something new.
    const offset = 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % (count - 1));
    bit = (bit + offset) % count;
    void update();
  });
  // The percentage is formatted text; everything else follows the language by itself.
  onLangChange(() => {
    if (bit >= 0) bitValue.textContent = t('lab.avalanche.bitValue', { byte: bit >> 3, bit: bit & 7 });
    renderResult();
  });

  await update();
}

/**
 * @param {HTMLElement} view
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @param {number} bit
 */
function renderInputs(view, a, b, bit) {
  const byteIndex = bit >> 3;
  /**
   * @param {string} titleKey
   * @param {Uint8Array} bytes
   */
  const side = (titleKey, bytes) =>
    h(
      'div',
      { class: 'av-input' },
      h('h3', { class: 'lab-panel__subtitle', i18n: titleKey }),
      h('p', { class: 'av-input__text', text: decoder.decode(bytes) }),
      h(
        'p',
        { class: 'byte-grid', translate: 'no' },
        Array.from(bytes, (byte, i) => [h('span', { class: ['byte', i === byteIndex && 'byte--one'] }, hex8(byte)), ' ']),
      ),
      h(
        'p',
        { class: 'av-input__bits' },
        h('span', { class: 'muted', i18n: 'lab.avalanche.changedByte' }),
        ' ',
        h(
          'code',
          { class: 'bits' },
          [...binary8(bytes[byteIndex])].map((digit, i) =>
            h('span', { class: ['bits__bit', i === (bit & 7) && 'is-flipped'] }, digit),
          ),
        ),
      ),
    );
  replaceContent(view, side('lab.avalanche.inputA', a), side('lab.avalanche.inputB', b));
}

/**
 * @param {string} labelKey
 * @param {string} hex
 */
function digestRow(labelKey, hex) {
  return h(
    'div',
    { class: 'av-digest' },
    h('p', { class: 'av-digest__label', i18n: labelKey }),
    h(
      'code',
      { class: 'digest__value av-digest__value', translate: 'no' },
      groupHex(hex).map((group) => h('span', { class: 'digest__group' }, group)),
    ),
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
