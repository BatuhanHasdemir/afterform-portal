// @ts-check
import { s } from '../core/dom.js';
import { hexToBytes } from '../lab/hex.js';

const HEIGHT = 32;

/**
 * One bar per byte, its height the byte value divided by 255.
 * @param {string} hex
 */
export function barHeights(hex) {
  return Array.from(hexToBytes(hex), (byte) => byte / 255);
}

/**
 * The digest drawn as vertical bars: the same file always gives the same pattern, a single
 * changed bit a completely different one. Decorative only; the hex text is the information.
 * @param {string} hex
 * @param {{ className?: string }} [options]
 */
export function fingerprint(hex, { className } = {}) {
  const heights = barHeights(hex);
  const width = heights.length * 2 - 1;
  return s(
    'svg',
    {
      class: ['fingerprint', className],
      viewBox: `0 0 ${width} ${HEIGHT}`,
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    heights.map((_, i) => s('rect', { class: 'fingerprint__slot', x: i * 2, y: 0, width: 1, height: HEIGHT })),
    heights.map((value, i) =>
      s('rect', {
        class: 'fingerprint__bar',
        x: i * 2,
        y: HEIGHT - value * HEIGHT,
        width: 1,
        height: value * HEIGHT,
      }),
    ),
  );
}
