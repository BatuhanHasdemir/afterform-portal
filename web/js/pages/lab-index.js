// @ts-check
import { fingerprint } from '../components/fingerprint.js';
import { whenInView } from '../components/in-view.js';
import { iterationBars } from '../components/iteration-bars.js';
import { h, icon, qs } from '../core/dom.js';
import { formatPercent } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { onLangChange, t } from '../core/i18n.js';
import { ALGORITHMS } from '../lab/algorithms.js';
import { bitAt, diffBits } from '../lab/bits.js';
import { bytesToHex, hex32, utf8Bytes } from '../lab/hex.js';
import { pad, sha256, sha256Trace } from '../lab/sha256.js';

// The pictures on this page are computed here, with the Lab's own SHA-256 (checked against
// Web Crypto in the tests and on the step-by-step screen).

// "abb" and "abc" differ in exactly one bit: 0x62 and 0x63.
const NEAR = ['abb', 'abc'];
const BITS = 256;

await bootPage({ access: 'public' });

const concept = (/** @type {string} */ name) => qs(`[data-concept="${name}"]`);
const preview = (/** @type {string} */ name) => qs(`[data-experiment="${name}"] [data-preview]`);
const digests = NEAR.map((text) => sha256(utf8Bytes(text)));
const abc = bytesToHex(digests[1]);
const short = `${abc.slice(0, 8)}…`;

// One-way: forward is a computation, backward has nothing to compute.
qs('[data-visual]', concept('oneWay')).append(
  h('p', { class: 'oneway', translate: 'no' }, h('code', { text: '"abc"' }), icon('arrow-right'), h('code', { text: short })),
  h('p', { class: 'oneway oneway--back', translate: 'no' }, h('code', { text: short }), icon('arrow-right'), h('code', { class: 'oneway__unknown', text: '?' })),
);
whenInView(concept('oneWay'));

// Collision resistance: the birthday bound, its exponent counted up once.
const exponent = h('sup', { text: '128' });
qs('[data-visual]', concept('collision')).append(
  h('p', { class: 'bound', translate: 'no' }, '2', exponent),
  h('p', { class: 'bound__label', i18n: 'lab.concepts.collision.figure' }),
);
whenInView(concept('collision'), () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now();
  const tick = (/** @type {number} */ now) => {
    const progress = Math.min(1, (now - start) / 1100);
    exponent.textContent = String(Math.round(128 * (1 - (1 - progress) ** 4)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// Avalanche: which of the 256 output bits differ between "abb" and "abc".
const { xor, changed } = diffBits(digests[0], digests[1]);
const grid = h(
  'div',
  { class: 'bitgrid' },
  Array.from({ length: BITS }, (_, i) => {
    const cell = h('span', { class: ['bitgrid__cell', bitAt(xor, i) === 1 && 'is-changed'] });
    cell.style.setProperty('--i', String(i));
    return cell;
  }),
);
const caption = h('p', { class: 'bitgrid__caption' });
const writeCaption = () => {
  caption.textContent = `"abb" / "abc" · ${t('lab.avalanche.changed', { count: changed, total: BITS, percent: formatPercent(changed / BITS, 1) })}`;
};
writeCaption();
onLangChange(writeCaption);
qs('[data-visual]', concept('avalanche')).append(grid, caption);
whenInView(concept('avalanche'), undefined, { threshold: 0.3 });

// Experiment previews.
// The padded block of "abc": the message, the 0x80 marker, zeros, then the length in bits.
const { padded } = pad(utf8Bytes('abc'));
preview('sha256').append(
  h(
    'ol',
    { class: 'block', translate: 'no' },
    Array.from(padded, (byte, i) => {
      const part = i < 3 ? 'is-message' : i === 3 ? 'is-marker' : i >= 56 ? 'is-length' : undefined;
      return h('li', { class: ['block__byte', part], text: byte.toString(16).padStart(2, '0') });
    }),
  ),
);
const round = sha256Trace(utf8Bytes('abc')).blocks[0].rounds[0];
preview('sha256').append(
  h(
    'ol',
    { class: 'registers', translate: 'no' },
    round.after.map((word, i) => h('li', { class: 'registers__cell' }, h('span', { class: 'registers__name', text: 'abcdefgh'[i] }), h('code', { text: hex32(word) }))),
  ),
);
preview('avalanche').append(
  ...digests.map((bytes) => fingerprint(bytesToHex(bytes), { className: 'lab-bento__print' })),
);
preview('pbkdf2').append(iterationBars({ compact: true }));
const longest = Math.max(...ALGORITHMS.map((algorithm) => algorithm.digestBits));
preview('compare').append(
  h(
    'ol',
    { class: 'lengths', translate: 'no' },
    ALGORITHMS.map((algorithm) => {
      const bar = h('span', { class: 'lengths__bar' });
      bar.style.setProperty('--share', String(algorithm.digestBits / longest));
      return h('li', { class: 'lengths__row' }, h('span', { text: algorithm.name }), bar, h('span', { class: 'lengths__bits', text: String(algorithm.digestBits) }));
    }),
  ),
);
whenInView(qs('[data-bento]'), undefined, { threshold: 0.2 });
