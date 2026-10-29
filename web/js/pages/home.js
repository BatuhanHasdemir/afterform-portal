// @ts-check
import { groupHex } from '../components/digest.js';
import { fingerprint } from '../components/fingerprint.js';
import { whenInView } from '../components/in-view.js';
import { signal } from '../components/signal.js';
import { statusBadge } from '../components/status-badge.js';
import { turntable } from '../components/studio.js';
import { PBKDF2_PROJECT_ITERATIONS } from '../core/config.js';
import { h, icon, qs } from '../core/dom.js';
import { sha256OfFile } from '../core/file-hash.js';
import { formatBytes, formatNumber, localizeFormats } from '../core/format.js';
import { bootPage, homeFor } from '../core/guard.js';
import { applyTranslations, onLangChange, t } from '../core/i18n.js';
import { algorithmById } from '../lab/algorithms.js';
import { SALT_BYTES } from '../lab/pbkdf2.js';
/** @import { Status } from '../core/types.js' */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The size of the eight-second seed demo, so the sample row reads like a real upload.
const SAMPLE_BYTES = 128_640;

const context = await bootPage({ access: 'public' });
const user = context?.user ?? null;

// Guests are asked to sign in or register; a signed-in visitor gets a way back to their own area.
for (const el of document.querySelectorAll('[data-show-for]')) {
  if (el instanceof HTMLElement) el.hidden = el.dataset.showFor !== (user ? 'user' : 'guest');
}
if (user) {
  for (const link of document.querySelectorAll('a[data-home-link]')) {
    link.setAttribute('href', homeFor(user));
  }
  const closingTitle = qs('#cta-title');
  closingTitle.dataset.i18n = 'home.cta.userTitle';
  applyTranslations(closingTitle);
}

stage(qs('[data-hero-photo]'));
signal(qs('[data-signal]'));
closing(qs('[data-turntable]'));
await previews();
figures(qs('[data-figures]'));

/**
 * The photo leans a little away from the pointer, as if the visitor were looking past the crowd
 * at the stage. The offset eases towards its target every frame instead of jumping, and the loop
 * stops once it has arrived. Only `transform` is set here: the settle and the scroll drift in
 * home.css use `scale` and `translate`, so the three movements add up instead of fighting.
 * @param {HTMLElement} root
 */
function stage(root) {
  if (reduce || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const photo = qs('img', root);
  const area = root.parentElement ?? root;
  const reach = { x: 14, y: 6 };
  const current = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let frame = 0;

  const step = () => {
    current.x += (target.x - current.x) * 0.08;
    current.y += (target.y - current.y) * 0.08;
    photo.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;
    const settled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) < 0.05;
    frame = settled ? 0 : requestAnimationFrame(step);
  };
  /** @param {number} x @param {number} y */
  const aim = (x, y) => {
    target.x = x;
    target.y = y;
    if (!frame) frame = requestAnimationFrame(step);
  };

  area.addEventListener('pointermove', (event) => {
    const box = root.getBoundingClientRect();
    const dx = (event.clientX - box.left) / box.width - 0.5;
    const dy = (event.clientY - box.top) / box.height - 0.5;
    aim(-dx * 2 * reach.x, -dy * 2 * reach.y);
  });
  area.addEventListener('pointerleave', () => aim(0, 0));
}

/**
 * The record turns with the page as it scrolls (CSS); the arm comes down onto it once, when the
 * turntable comes into view.
 * @param {HTMLElement} root
 */
function closing(root) {
  root.replaceChildren(turntable());
  whenInView(root, undefined, { threshold: 0.35 });
}

/**
 * Each step of the bento shows a small, real piece of the portal doing its job. They play once,
 * when the step comes into view, because that is when the visitor is reading that step.
 */
async function previews() {
  const sample = globalThis.crypto?.subtle ? await sha256OfFile(new Blob(['AFTER/FORM'])) : null;
  /** @type {Record<string, (root: HTMLElement) => () => void>} */
  const builders = {
    account: accountPreview,
    upload: (root) => uploadPreview(root, sample),
    status: statusPreview,
  };
  for (const step of document.querySelectorAll('[data-step]')) {
    if (!(step instanceof HTMLElement)) continue;
    const play = builders[step.dataset.step ?? '']?.(qs('[data-preview]', step));
    if (play) whenInView(step, play, { threshold: 0.45 });
  }
}

/**
 * A password being typed: the meter goes from short to strong.
 * @param {HTMLElement} root
 */
function accountPreview(root) {
  const dots = h('span', { class: 'preview-field__dots' });
  const meter = h(
    'div',
    { class: 'password-meter preview-meter', dataset: { level: 'empty' } },
    h('span', { class: 'password-meter__bar' }, h('span'), h('span'), h('span')),
    h('span', { class: 'preview-meter__text', i18n: 'auth.password.strength.strong' }),
  );
  root.append(h('div', { class: 'preview-field' }, dots), meter);
  const steps = /** @type {const} */ ([
    [5, 'short'],
    [11, 'fair'],
    [16, 'strong'],
  ]);
  return () => {
    if (reduce) {
      dots.textContent = '•'.repeat(16);
      meter.dataset.level = 'strong';
      return;
    }
    steps.forEach(([length, level], i) => {
      setTimeout(() => {
        dots.textContent = '•'.repeat(length);
        meter.dataset.level = level;
      }, 250 + i * 520);
    });
  };
}

/**
 * A file on its way up, then its fingerprint as the server computes it.
 * @param {HTMLElement} root
 * @param {string | null} hex
 */
function uploadPreview(root, hex) {
  root.append(
    h(
      'div',
      { class: 'preview-file' },
      icon('upload'),
      h('span', { text: 'demo.mp3' }),
      h('span', { class: 'preview-file__size', 'data-bytes': SAMPLE_BYTES, text: formatBytes(SAMPLE_BYTES) }),
    ),
    h('div', { class: 'preview-progress' }, h('span', { class: 'preview-progress__fill' })),
  );
  onLangChange(() => localizeFormats(root));
  if (!hex) return () => {};
  const print = fingerprint(hex, { className: 'preview-print' });
  root.append(print, h('code', { class: 'preview-digest', translate: 'no', text: groupHex(hex).slice(0, 4).join(' ') }));
  return () => {
    // The bars grow once the bar above has filled: first the upload, then the digest.
    setTimeout(() => print.classList.add('fingerprint--draw'), reduce ? 0 : 900);
  };
}

/**
 * The statuses a demo passes through, arriving one after the other.
 * @param {HTMLElement} root
 */
function statusPreview(root) {
  /** @type {Status[]} */
  const path = ['pending', 'in_review', 'accepted'];
  root.append(h('ol', { class: 'preview-status' }, path.map((status) => h('li', { class: 'preview-status__item' }, statusBadge(status)))));
  return () => {};
}

/**
 * The numbers come from the same configuration the portal runs on. The iteration count is
 * counted up once when it comes into view, to show its size; the final value is what screen
 * readers get from the start.
 * @param {HTMLElement} root
 */
function figures(root) {
  const value = (/** @type {string} */ name) => qs(`[data-figure="${name}"]`, root);
  const iterations = value('iterations');
  const shown = h('span', { 'aria-hidden': 'true' });
  const spoken = h('span', { class: 'visually-hidden' });
  iterations.replaceChildren(shown, spoken);

  const write = () => {
    const final = formatNumber(PBKDF2_PROJECT_ITERATIONS);
    shown.textContent = final;
    spoken.textContent = final;
    value('salt').textContent = t('lab.units.bytes', { count: SALT_BYTES });
    value('digest').textContent = t('lab.units.bits', { count: algorithmById('sha256')?.digestBits ?? 256 });
  };
  write();
  onLangChange(write);
  if (reduce) return;

  whenInView(
    root,
    () => {
      const start = performance.now();
      const duration = 1400;
      const tick = (/** @type {number} */ now) => {
        const progress = Math.min(1, (now - start) / duration);
        // Fast at first, settling at the end: the same curve as the interface's ease-out.
        const eased = 1 - (1 - progress) ** 4;
        shown.textContent = formatNumber(Math.round(PBKDF2_PROJECT_ITERATIONS * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { threshold: 0.6 },
  );
}
