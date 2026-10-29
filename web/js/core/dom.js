// @ts-check
import { applyTranslations } from './i18n.js';

/** @typedef {Node | string | number | false | null | undefined | Child[]} Child */

/**
 * @typedef {object} BaseAttrs
 * @property {string | Array<string | false | null | undefined>} [class]
 * @property {Record<string, string>} [dataset]
 * @property {string | number} [text] set as textContent
 * @property {string} [i18n] translation key for the text; re-applied on language change
 * @property {Record<string, string | number>} [i18nParams] placeholder values for `i18n`
 * @property {Record<string, string>} [i18nAttr] attribute name -> translation key
 * @property {{ [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void }} [on]
 */

/** @typedef {BaseAttrs & Record<string, unknown>} Attrs */

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

/**
 * Creates an element. Dynamic values only ever become text nodes or attribute values, never markup.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Attrs} [attrs]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    switch (key) {
      case 'class':
        el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
        break;
      case 'dataset':
        Object.assign(el.dataset, value);
        break;
      case 'text':
        el.textContent = String(value);
        break;
      case 'i18n':
        el.setAttribute('data-i18n', String(value));
        break;
      case 'i18nParams':
        el.setAttribute('data-i18n-params', JSON.stringify(value));
        break;
      case 'i18nAttr':
        el.setAttribute(
          'data-i18n-attr',
          Object.entries(/** @type {Record<string, string>} */ (value))
            .map(([attr, k]) => `${attr}:${k}`)
            .join(';'),
        );
        break;
      case 'on':
        for (const [type, listener] of Object.entries(/** @type {Record<string, EventListener>} */ (value))) {
          el.addEventListener(type, listener);
        }
        break;
      default:
        setAttr(el, key, value);
    }
  }
  append(el, children);
  if (attrs.i18n || attrs.i18nAttr) applyTranslations(el);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an SVG element; attributes follow the same rules as h().
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {...Child} children
 * @returns {SVGElement}
 */
export function s(tag, attrs = {}, ...children) {
  const el = /** @type {SVGElement} */ (document.createElementNS(SVG_NS, tag));
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value));
    } else {
      setAttr(el, key, value);
    }
  }
  append(el, children);
  return el;
}

/**
 * Icon from the sprite. Always decorative: the text next to it carries the meaning.
 * @param {string} name symbol id in /assets/icons.svg
 */
export function icon(name) {
  return s(
    'svg',
    { class: 'icon', 'aria-hidden': 'true', focusable: 'false' },
    s('use', { href: `/assets/icons.svg#${name}` }),
  );
}

/**
 * @param {Element} el
 * @param {string} name
 * @param {unknown} value
 */
function setAttr(el, name, value) {
  if (/^on/i.test(name)) throw new TypeError(`Use the "on" map for event listeners, not "${name}".`);
  // CSP forbids inline style attributes; dynamic styling goes through el.style.setProperty.
  if (name === 'style') throw new TypeError('Inline style attributes are not allowed.');
  const text = value === true ? '' : String(value);
  if (URL_ATTRS.has(name) && /^\s*(?:javascript|vbscript):/i.test(text)) {
    throw new TypeError(`Refusing an executable URL in "${name}".`);
  }
  el.setAttribute(name, text);
}

/**
 * @param {Node} parent
 * @param {Child[]} children
 */
export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * @param {Element} el
 * @param {...Child} children
 */
export function replaceContent(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

/**
 * @template {Element} [E=HTMLElement]
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {E}
 */
export function qs(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return /** @type {E} */ (el);
}
