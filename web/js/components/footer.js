// @ts-check
import { h, replaceContent, s } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { PUBLIC_LINKS, portalLinks } from './header.js';
/** @import { User } from '../core/types.js' */
/** @import { NavLink } from './header.js' */

/** @param {User | null} [user] */
export function renderFooter(user = null) {
  const host = document.getElementById('site-footer');
  if (!host) return;
  host.classList.add('site-footer');
  replaceContent(
    host,
    h(
      'div',
      { class: 'container site-footer__inner' },
      h(
        'div',
        { class: 'site-footer__top' },
        h('p', { class: 'site-footer__tagline', i18n: 'home.tagline' }),
        h(
          'nav',
          { class: 'site-footer__nav', i18nAttr: { 'aria-label': 'nav.footer' } },
          linkGroup('footer-explore', 'nav.footerExplore', PUBLIC_LINKS),
          linkGroup('footer-portal', 'nav.footerPortal', portalLinks(user)),
        ),
      ),
      bigWordmark(),
      h('p', { class: 'site-footer__note', i18n: 'common.footerNote' }),
    ),
  );
}

/**
 * @param {string} id
 * @param {string} titleKey
 * @param {readonly NavLink[]} links
 */
function linkGroup(id, titleKey, links) {
  return h(
    'div',
    { class: 'site-footer__group' },
    h('p', { class: 'site-footer__group-title', id, i18n: titleKey }),
    h(
      'ul',
      { class: 'site-footer__links', 'aria-labelledby': id },
      links.map(({ href, key }) => h('li', {}, h('a', { href, i18n: key }))),
    ),
  );
}

/**
 * The wordmark once more, as wide as the page. It is a picture of the name, which the visitor
 * has already met in the header, so screen readers skip it.
 */
function bigWordmark() {
  const [before, after] = t('common.brand').split('/');
  return s(
    'svg',
    { class: 'site-footer__mark', viewBox: '0 0 1000 136', 'aria-hidden': 'true', focusable: 'false' },
    s(
      'text',
      { x: 500, y: 122, 'text-anchor': 'middle', textLength: 1000, lengthAdjust: 'spacing' },
      before,
      s('tspan', { class: 'site-footer__slash' }, '/'),
      after,
    ),
  );
}
