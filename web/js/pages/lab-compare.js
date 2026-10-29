// @ts-check
import { groupHex } from '../components/digest.js';
import { h, icon, qs, replaceContent } from '../core/dom.js';
import { bootPage } from '../core/guard.js';
import { ALGORITHMS } from '../lab/algorithms.js';
import { bytesToHex, utf8Bytes } from '../lab/hex.js';
import { md5 } from '../lab/md5.js';
import { sha1 } from '../lab/sha1.js';
import { sha256 } from '../lab/sha256.js';
import { sha3_256 } from '../lab/sha3.js';
/** @import { Algorithm } from '../lab/algorithms.js' */

/** @typedef {'webCrypto' | 'webCryptoChecked' | 'mismatch' | 'own'} Source */
/** @typedef {{ hex: string, source: Source } | null} Result */

const INPUT_DELAY_MS = 150;

/**
 * The Lab's own implementations: the only source where the browser has no such digest (MD5,
 * SHA3-256), and a cross-check against Web Crypto everywhere else.
 * @type {Readonly<Record<string, (message: Uint8Array) => Uint8Array>>}
 */
const OWN = Object.freeze({ md5, sha1, sha256, 'sha3-256': sha3_256 });

/** Status colours are reserved for state and always come with an icon and words. */
const STATUS = Object.freeze({
  broken: { icon: 'status-rejected', className: 'algo-status--broken' },
  deprecated: { icon: 'warning', className: 'algo-status--deprecated' },
  secure: { icon: 'status-accepted', className: 'algo-status--secure' },
});

const context = await bootPage({ access: 'public' });
if (context) {
  const input = /** @type {HTMLTextAreaElement} */ (qs('#cmp-input'));
  const digests = qs('[data-digests]');
  let run = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let inputTimer;

  replaceContent(qs('[data-structure]'), ALGORITHMS.map(structureRow));

  const update = async () => {
    const bytes = utf8Bytes(input.value);
    const current = ++run;
    const available = Boolean(globalThis.crypto?.subtle);
    const results = await Promise.all(ALGORITHMS.map((algorithm) => digestOf(algorithm, bytes, available)));
    if (current !== run) return;
    replaceContent(
      digests,
      ALGORITHMS.map((algorithm, i) => digestItem(algorithm, results[i])),
    );
  };

  input.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => void update(), INPUT_DELAY_MS);
  });
  await update();
}

/**
 * @param {Algorithm} algorithm
 * @param {Uint8Array<ArrayBuffer>} bytes
 * @param {boolean} available whether Web Crypto exists on this page
 * @returns {Promise<Result>}
 */
async function digestOf(algorithm, bytes, available) {
  const own = OWN[algorithm.id];
  const ownHex = own ? bytesToHex(own(bytes)) : null;
  if (!algorithm.webCrypto || !available) return ownHex ? { hex: ownHex, source: 'own' } : null;
  const webHex = bytesToHex(new Uint8Array(await crypto.subtle.digest(algorithm.webCrypto, bytes)));
  if (ownHex === null) return { hex: webHex, source: 'webCrypto' };
  return { hex: webHex, source: ownHex === webHex ? 'webCryptoChecked' : 'mismatch' };
}

/**
 * @param {Algorithm} algorithm
 * @param {Result} result
 */
function digestItem(algorithm, result) {
  return h(
    'li',
    { class: 'cmp-digest' },
    h(
      'p',
      { class: 'cmp-digest__head' },
      h('span', { class: 'cmp-digest__name', text: algorithm.name }),
      h('span', { class: 'muted mono', i18n: 'lab.compare.bits', i18nParams: { count: algorithm.digestBits } }),
    ),
    result
      ? [
          h('code', { class: 'digest__value cmp-digest__value', translate: 'no' }, groupHex(result.hex).map((group) => h('span', { class: 'digest__group' }, group))),
          h('p', { class: ['cmp-digest__source', result.source === 'mismatch' && 'cmp-digest__source--mismatch'], i18n: `lab.compare.source.${result.source}` }),
        ]
      : h('p', { class: 'muted cmp-digest__missing', i18n: 'lab.compare.unavailable' }),
  );
}

/** @param {Algorithm} algorithm */
function structureRow(algorithm) {
  const status = STATUS[algorithm.status];
  /**
   * @param {string} labelKey column heading, repeated before the value when rows stack
   * @param {import('../core/dom.js').Child} content
   */
  const cell = (labelKey, content) =>
    h('td', { role: 'cell', i18nAttr: { 'data-label': labelKey } }, content);
  return h(
    'tr',
    { role: 'row' },
    h('th', { scope: 'row', role: 'rowheader', class: 'cmp-table__name', text: algorithm.name }),
    cell('lab.compare.columns.digest', h('span', { i18n: 'lab.compare.bits', i18nParams: { count: algorithm.digestBits } })),
    cell(
      'lab.compare.columns.block',
      algorithm.sponge
        ? h('span', { i18n: 'lab.compare.sponge', i18nParams: { rate: algorithm.sponge.rate, capacity: algorithm.sponge.capacity } })
        : h('span', { i18n: 'lab.compare.bits', i18nParams: { count: algorithm.blockBits ?? 0 } }),
    ),
    cell('lab.compare.columns.structure', h('span', { i18n: `lab.compare.structure.${algorithm.structure}` })),
    cell('lab.compare.columns.rounds', h('span', { i18n: `lab.compare.roundUnits.${algorithm.roundUnit}`, i18nParams: { count: algorithm.rounds } })),
    cell(
      'lab.compare.columns.status',
      h('span', { class: ['algo-status', status.className] }, icon(status.icon), h('span', { i18n: `lab.compare.status.${algorithm.status}` })),
    ),
  );
}
