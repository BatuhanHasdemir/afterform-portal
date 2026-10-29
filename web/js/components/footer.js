// @ts-check
import { HOME_BY_ROLE, PBKDF2_PROJECT_ITERATIONS } from '../core/config.js';
import { h, icon, replaceContent, s } from '../core/dom.js';
import { formatNumber } from '../core/format.js';
import { onLangChange, t } from '../core/i18n.js';
import { SALT_BYTES } from '../lab/pbkdf2.js';
import { PUBLIC_LINKS, portalLinks, wordmark } from './header.js';
/** @import { User } from '../core/types.js' */
/** @import { NavLink } from './header.js' */

/** @type {readonly NavLink[]} */
const EXPLORE_LINKS = Object.freeze([{ href: '/', key: 'nav.home' }, ...PUBLIC_LINKS]);

/** @type {readonly NavLink[]} */
const LAB_LINKS = Object.freeze([
  { href: '/lab/sha256.html', key: 'lab.sha256.title' },
  { href: '/lab/avalanche.html', key: 'lab.avalanche.title' },
  { href: '/lab/pbkdf2.html', key: 'lab.pbkdf2.title' },
  { href: '/lab/compare.html', key: 'lab.compare.title' },
]);

/** @type {readonly NavLink[]} */
const DESK_LINKS = Object.freeze([
  { href: HOME_BY_ROLE.admin, key: 'common.footer.desk.all' },
  { href: `${HOME_BY_ROLE.admin}?status=pending`, key: 'common.footer.desk.pending' },
  { href: `${HOME_BY_ROLE.admin}?status=in_review`, key: 'common.footer.desk.inReview' },
]);

/**
 * The footer is the closing scene of every page and stays dark in both themes, like the hero.
 * It carries the brand and what the company does, the site's map, the numbers the portal
 * protects accounts and files with, and the way back up. The team gets a shorter one.
 * @param {User | null} [user]
 */
export function renderFooter(user = null) {
  const host = document.getElementById('site-footer');
  if (!host) return;
  host.classList.add('site-footer');
  const desk = user?.role === 'admin';
  host.classList.toggle('site-footer--desk', desk);
  if (desk) {
    renderDeskFooter(host);
    return;
  }
  const specs = h('ul', { class: 'site-footer__specs', 'aria-labelledby': 'footer-specs' });
  replaceContent(
    host,
    h(
      'div',
      { class: 'container site-footer__main' },
      h(
        'div',
        { class: 'site-footer__brand' },
        wordmark(),
        h('p', { class: 'site-footer__about', i18n: 'common.footer.about' }),
        callToAction(user),
      ),
      h(
        'nav',
        { class: 'site-footer__nav', i18nAttr: { 'aria-label': 'nav.footer' } },
        linkGroup('footer-explore', 'nav.footerExplore', EXPLORE_LINKS),
        linkGroup('footer-lab', 'nav.lab', LAB_LINKS),
        linkGroup('footer-portal', 'nav.footerPortal', portalLinks(user)),
      ),
    ),
    h(
      'div',
      { class: 'container site-footer__security' },
      h('p', { class: 'site-footer__group-title', id: 'footer-specs', i18n: 'common.footer.specs.title' }),
      specs,
    ),
    bigWordmark(),
    bottomBar(),
  );

  const writeSpecs = () => {
    specs.replaceChildren(
      ...[
        'PBKDF2-HMAC-SHA512',
        t('common.footer.specs.iterations', { count: formatNumber(PBKDF2_PROJECT_ITERATIONS) }),
        t('common.footer.specs.salt', { count: SALT_BYTES }),
        t('common.footer.specs.digest'),
      ].map((text) => h('li', { class: 'site-footer__spec', text })),
    );
  };
  writeSpecs();
  onLangChange(writeSpecs);
}

/**
 * The team's footer: the review desk's own shortcuts and the way back up. The site map, the call
 * to action and the security figures are written for artists and guests.
 * @param {HTMLElement} host
 */
function renderDeskFooter(host) {
  replaceContent(
    host,
    h(
      'div',
      { class: 'container site-footer__main' },
      h(
        'div',
        { class: 'site-footer__brand' },
        wordmark(),
        h('p', { class: 'site-footer__about', i18n: 'common.footer.desk.about' }),
      ),
      h(
        'nav',
        { class: 'site-footer__nav', i18nAttr: { 'aria-label': 'nav.footer' } },
        linkGroup('footer-desk', 'nav.admin', DESK_LINKS),
      ),
    ),
    bottomBar(),
  );
}

function bottomBar() {
  return h(
    'div',
    { class: 'site-footer__bar' },
    h(
      'div',
      { class: 'container site-footer__bar-inner' },
      h(
        'p',
        { class: 'site-footer__note' },
        h('span', { class: 'site-footer__copyright', text: `© ${new Date().getFullYear()} ${t('common.brand')}` }),
        h('span', { i18n: 'common.footerNote' }),
      ),
      // An empty fragment is the top of the document: the page scrolls up and the next Tab
      // starts from the skip link again.
      h('a', { class: 'site-footer__up', href: '#' }, h('span', { i18n: 'common.footer.backToTop' }), icon('arrow-up')),
    ),
  );
}

/**
 * The one thing to do next, for this visitor: send a demo, or go back to their own area.
 * Admins get the desk footer, which has no call to action.
 * @param {User | null} user
 */
function callToAction(user) {
  const [href, key] = user ? ['/portal/upload.html', 'nav.upload'] : ['/register.html', 'common.footer.cta'];
  return h('a', { class: 'btn btn--primary site-footer__cta', href }, h('span', { i18n: key }), icon('arrow-up-right'));
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
  return h(
    'div',
    { class: 'container' },
    s(
      'svg',
      { class: 'site-footer__mark', viewBox: '0 0 1000 136', 'aria-hidden': 'true', focusable: 'false' },
      s(
        'text',
        { x: 500, y: 122, 'text-anchor': 'middle', textLength: 1000, lengthAdjust: 'spacing' },
        before,
        s('tspan', { class: 'site-footer__slash' }, '/'),
        after,
      ),
    ),
  );
}
