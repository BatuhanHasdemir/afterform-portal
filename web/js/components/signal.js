// @ts-check
import { h, s } from '../core/dom.js';
import { sha256OfFile } from '../core/file-hash.js';
import { onLangChange, t } from '../core/i18n.js';
import { groupHex } from './digest.js';
import { barHeights } from './fingerprint.js';

const BARS = 32;
const HEIGHT = 32;
// A zero byte still shows as a sliver, so every bar stays readable as a bar.
const FLOOR = 0.05;
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const INTRO_DELAY_MS = 450;

/**
 * Bar heights of a waveform: two sines under an envelope that swells and fades, so it reads as
 * a sound rather than as noise. The same every time; nothing here is random.
 * @param {number} [count]
 */
export function waveform(count = BARS) {
  return Array.from({ length: count }, (_, i) => {
    const x = i / (count - 1);
    const envelope = Math.sin(Math.PI * (0.06 + 0.88 * x));
    const wave = Math.abs(0.62 * Math.sin(i * 0.92) + 0.38 * Math.sin(i * 0.37 + 1.1));
    return Math.max(FLOOR, Math.min(1, 0.12 + 0.88 * envelope * wave));
  });
}

/**
 * A sound bar is centred on the midline; a fingerprint bar stands on the baseline. Both are a
 * full-height bar scaled from the bottom, so moving between them touches only transform.
 * @param {number} height 0..1
 */
const soundTransform = (height) => `translateY(${(-(1 - height) * 50).toFixed(2)}%) scaleY(${height.toFixed(3)})`;
/** @param {number} height */
const printTransform = (height) => `translateY(0%) scaleY(${Math.max(FLOOR, height).toFixed(3)})`;

/**
 * The hero picture: a waveform that turns into the SHA-256 fingerprint of the headline, which is
 * what the portal does with every file. A new language means a new sentence, and so a completely
 * different fingerprint.
 * @param {HTMLElement} host [data-signal] with [data-signal-art] and [data-signal-digest]
 */
export function signal(host) {
  const art = /** @type {HTMLElement} */ (host.querySelector('[data-signal-art]'));
  const digestText = /** @type {HTMLElement} */ (host.querySelector('[data-signal-digest]'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sound = waveform().map(soundTransform);

  const bars = sound.map((transform, i) => {
    const bar = s('rect', { class: 'signal__bar', x: i * 2, y: 0, width: 1, height: HEIGHT });
    bar.style.transform = transform;
    return bar;
  });
  art.replaceChildren(
    s(
      'svg',
      {
        class: 'signal__bars',
        viewBox: `0 0 ${BARS * 2 - 1} ${HEIGHT}`,
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      // Faint full-height tracks give the bars a common frame in both states.
      sound.map((_, i) => s('rect', { class: 'signal__track', x: i * 2, y: 0, width: 1, height: HEIGHT })),
      bars,
    ),
  );

  /** @type {Animation[]} */
  let running = [];
  /** @type {string[]} */
  let print = [];
  let busy = false;

  /**
   * Starts from wherever the bars are now, so a new morph can interrupt an old one smoothly.
   * @param {string[]} targets
   * @param {{ duration: number, stagger: number }} timing
   */
  const moveTo = (targets, { duration, stagger }) => {
    for (const animation of running) {
      try {
        animation.commitStyles();
      } catch {
        // Not rendered (e.g. a hidden tab); the next animation starts from the last target.
      }
      animation.cancel();
    }
    running = bars.map((bar, i) =>
      bar.animate([{ transform: targets[i] }], { duration, delay: i * stagger, easing: EASE_IN_OUT, fill: 'forwards' }),
    );
    return Promise.allSettled(running.map((animation) => animation.finished));
  };

  const showDigest = async () => {
    if (!globalThis.crypto?.subtle) return;
    const hex = await sha256OfFile(new Blob([t('home.tagline')]));
    print = barHeights(hex).map(printTransform);
    digestText.replaceChildren(
      ...groupHex(hex).map((group, i) => {
        const span = h('span', { class: 'digest__group signal__group', text: group });
        span.style.setProperty('--i', String(i));
        return span;
      }),
    );
    if (reduce) {
      bars.forEach((bar, i) => {
        bar.style.transform = print[i];
      });
      host.dataset.state = 'print';
      return;
    }
    busy = true;
    host.dataset.state = 'morph';
    await moveTo(print, { duration: 900, stagger: 16 });
    host.dataset.state = 'print';
    busy = false;
  };

  // Pointing at the picture plays it again: back to sound, then to the fingerprint.
  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    host.addEventListener('pointerenter', async () => {
      if (busy || print.length === 0) return;
      busy = true;
      host.dataset.state = 'morph';
      await moveTo(sound, { duration: 360, stagger: 4 });
      await moveTo(print, { duration: 760, stagger: 14 });
      host.dataset.state = 'print';
      busy = false;
    });
  }

  onLangChange(() => void showDigest());
  setTimeout(() => void showDigest(), reduce ? 0 : INTRO_DELAY_MS);
}
