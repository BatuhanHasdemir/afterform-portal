// @ts-check
import { s } from '../core/dom.js';

// The closing band's turntable. It is decorative and drawn from plain shapes, so its colours come
// from the theme's tokens and all its motion lives in CSS (home.css), where reduced motion stops it.
// Paints that point at a gradient are attributes: a url(#id) in an external stylesheet would be
// looked up next to the stylesheet rather than in this document.

/** @param {number} value */
const r1 = (value) => Math.round(value * 10) / 10;

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} degrees clockwise from the positive x axis, as on screen
 */
function polar(cx, cy, radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return [r1(cx + radius * Math.cos(angle)), r1(cy + radius * Math.sin(angle))];
}

/**
 * A ring segment between two radii, from one angle to another (clockwise).
 * @param {number} cx
 * @param {number} cy
 * @param {number} inner
 * @param {number} outer
 * @param {number} from
 * @param {number} to
 */
function sector(cx, cy, inner, outer, from, to) {
  const [ax, ay] = polar(cx, cy, outer, from);
  const [bx, by] = polar(cx, cy, outer, to);
  const [cx2, cy2] = polar(cx, cy, inner, to);
  const [dx, dy] = polar(cx, cy, inner, from);
  return `M${ax} ${ay}A${outer} ${outer} 0 0 1 ${bx} ${by}L${cx2} ${cy2}A${inner} ${inner} 0 0 0 ${dx} ${dy}Z`;
}

/**
 * @param {'linearGradient' | 'radialGradient'} kind
 * @param {string} id
 * @param {Array<[number, string, number?]>} stops offset, class, opacity
 * @param {Record<string, string | number>} [attrs]
 */
function gradient(kind, id, stops, attrs = {}) {
  return s(
    kind,
    { id, ...attrs },
    stops.map(([offset, className, opacity = 1]) => s('stop', { offset, class: className, 'stop-opacity': opacity })),
  );
}

const RECORD = { x: 290, y: 300 };
const PIVOT = { x: 556, y: 74 };

/** The closing band's turntable: a record with the label in the brand colour and a tonearm. */
export function turntable() {
  const { x, y } = RECORD;
  const grooves = [];
  for (let radius = 100; radius <= 234; radius += 3) grooves.push(s('circle', { class: 'record__groove', cx: x, cy: y, r: radius }));
  const strobe = Array.from({ length: 90 }, (_, i) => {
    const [dx, dy] = polar(x, y, 247, i * 4);
    return s('circle', { class: 'record__dot', cx: dx, cy: dy, r: 1.6 });
  });

  // The arm points from the pivot towards the grooves; the headshell bends a little further in.
  const arm = 139;
  const [ex, ey] = polar(PIVOT.x, PIVOT.y, 150, arm);
  const [hx, hy] = polar(ex, ey, 30, arm + 25);
  const [wx, wy] = polar(PIVOT.x, PIVOT.y, 34, arm + 180);

  // Two opposite highlights, each brightest along its middle and fading out to both edges.
  const sheens = [
    [290, 328],
    [110, 148],
  ];
  const sheenGradients = sheens.map(([from, to], i) => {
    const [ax, ay] = polar(x, y, 170, from);
    const [bx, by] = polar(x, y, 170, to);
    return gradient(
      'linearGradient',
      `record-sheen-${i}`,
      [
        [0, 'record__stop--light', 0],
        [0.5, 'record__stop--light', 0.09],
        [1, 'record__stop--light', 0],
      ],
      { gradientUnits: 'userSpaceOnUse', x1: ax, y1: ay, x2: bx, y2: by },
    );
  });

  return s(
    'svg',
    { class: 'turntable__art', viewBox: '0 0 600 520', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, sheenGradients),
    s(
      'g',
      { class: 'record__disc' },
      s('circle', { class: 'record__platter', cx: x, cy: y, r: 252 }),
      strobe,
      s('circle', { class: 'record__vinyl', cx: x, cy: y, r: 240 }),
      grooves,
      [136, 172, 208].map((radius) => s('circle', { class: 'record__gap', cx: x, cy: y, r: radius })),
      s('circle', { class: 'record__label', cx: x, cy: y, r: 84 }),
      s('circle', { class: 'record__label-ring', cx: x, cy: y, r: 76 }),
      s('text', { class: 'record__brand', x, y: y - 22, 'text-anchor': 'middle' }, 'AFTER/FORM'),
      s('text', { class: 'record__meta', x, y: y + 38, 'text-anchor': 'middle' }, '33⅓ · A'),
      s('circle', { class: 'record__spindle', cx: x, cy: y, r: 5 }),
    ),
    // The sheen belongs to the light, not to the record, so it stays put while the record turns.
    sheens.map(([from, to], i) => s('path', { class: 'record__sheen', d: sector(x, y, 90, 238, from, to), fill: `url(#record-sheen-${i})` })),
    s(
      'g',
      { class: 'tonearm' },
      s('rect', { class: 'tonearm__weight', x: wx - 13, y: wy - 10, width: 26, height: 20, rx: 3, transform: `rotate(${arm} ${wx} ${wy})` }),
      s('circle', { class: 'tonearm__base', cx: PIVOT.x, cy: PIVOT.y, r: 32 }),
      s('path', { class: 'tonearm__arm', d: `M${wx} ${wy}L${PIVOT.x} ${PIVOT.y}L${ex} ${ey}` }),
      s('path', { class: 'tonearm__head', d: `M${ex} ${ey}L${hx} ${hy}` }),
      s('circle', { class: 'tonearm__bearing', cx: PIVOT.x, cy: PIVOT.y, r: 15 }),
    ),
  );
}
