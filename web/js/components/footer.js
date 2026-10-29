// @ts-check
import { h, replaceContent } from '../core/dom.js';
import { PUBLIC_LINKS, wordmark } from './header.js';

export function renderFooter() {
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
        { class: 'site-footer__about' },
        wordmark({ link: false }),
        h('p', { class: 'site-footer__note', i18n: 'common.footerNote' }),
      ),
      h(
        'nav',
        { class: 'site-footer__nav', i18nAttr: { 'aria-label': 'nav.footer' } },
        h(
          'ul',
          { class: 'site-footer__links' },
          PUBLIC_LINKS.map(({ href, key }) => h('li', {}, h('a', { href, i18n: key }))),
        ),
      ),
    ),
  );
}
