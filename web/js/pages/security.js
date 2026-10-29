// @ts-check
import { groupHex } from '../components/digest.js';
import { fingerprint } from '../components/fingerprint.js';
import { whenInView } from '../components/in-view.js';
import { iterationBars } from '../components/iteration-bars.js';
import { PBKDF2_PROJECT_ITERATIONS } from '../core/config.js';
import { h, qs } from '../core/dom.js';
import { sha256OfFile } from '../core/file-hash.js';
import { formatNumber } from '../core/format.js';
import { bootPage } from '../core/guard.js';
import { onLangChange } from '../core/i18n.js';
import { bytesToHex } from '../lab/hex.js';
import { derive, randomSalt } from '../lab/pbkdf2.js';

// Each card shows its idea with a real computation from this browser; nothing here is mocked.

// A sample, never a real password: the point is that the same input meets two different salts.
const SAMPLE_PASSWORD = 'after-form-demo';

await bootPage({ access: 'public' });

const card = (/** @type {string} */ name) => qs(`[data-card="${name}"]`);
const visual = (/** @type {string} */ name) => qs('[data-visual]', card(name));
const canHash = Boolean(globalThis.crypto?.subtle);

// SHA-256 of "abc", the FIPS 180-4 example: the digest, then its fingerprint drawn in.
if (canHash) {
  const hex = await sha256OfFile(new Blob(['abc']));
  const print = fingerprint(hex, { className: 'security-print' });
  visual('sha256').append(
    h('p', { class: 'security-sample', translate: 'no' }, h('span', { class: 'security-sample__input', text: 'SHA-256("abc")' })),
    h('code', { class: 'digest__value security-digest', translate: 'no' }, groupHex(hex).map((group) => h('span', { class: 'digest__group' }, group))),
    print,
  );
  whenInView(card('sha256'), () => print.classList.add('fingerprint--draw'));
}

// The three layers, outermost first; the count says how often the inner two run.
const count = h('span', { class: 'nest__count', translate: 'no' });
const writeCount = () => {
  count.textContent = `× ${formatNumber(PBKDF2_PROJECT_ITERATIONS)}`;
};
writeCount();
onLangChange(writeCount);
visual('pbkdf2').append(
  h(
    'div',
    { class: 'nest nest--outer', translate: 'no' },
    h('span', { class: 'nest__label' }, 'PBKDF2', count),
    h('div', { class: 'nest nest--middle' }, h('span', { class: 'nest__label', text: 'HMAC' }), h('div', { class: 'nest nest--inner' }, h('span', { class: 'nest__label', text: 'SHA-512' }))),
  ),
);
whenInView(card('pbkdf2'));

// The same sample password with two fresh salts, through the project's own PBKDF2 setting.
const rows = [0, 1].map(() => {
  const salt = h('code', { class: 'salt-row__salt', translate: 'no' });
  const output = h('code', { class: 'salt-row__output', translate: 'no' });
  return { salt, output, row: h('li', { class: 'salt-row' }, h('span', { class: 'salt-row__label', i18n: 'security.visual.salt' }), salt, h('span', { class: 'salt-row__label', i18n: 'security.visual.output' }), output) };
});
visual('salt').append(
  h('p', { class: 'security-sample', i18n: 'security.visual.samePassword' }),
  h('ol', { class: 'salt-rows', role: 'list' }, rows.map(({ row }) => row)),
);
if (canHash) {
  // Two full-cost derivations: worth it once the card is actually being looked at.
  whenInView(card('salt'), async () => {
    card('salt').setAttribute('aria-busy', 'true');
    for (const { salt, output } of rows) {
      const bytes = randomSalt();
      salt.textContent = bytesToHex(bytes).slice(0, 16);
      const result = await derive({ password: SAMPLE_PASSWORD, salt: bytes, iterations: PBKDF2_PROJECT_ITERATIONS });
      output.textContent = bytesToHex(result.bytes).slice(0, 16);
    }
    card('salt').removeAttribute('aria-busy');
  });
}

visual('iterations').append(iterationBars());
whenInView(card('iterations'));
