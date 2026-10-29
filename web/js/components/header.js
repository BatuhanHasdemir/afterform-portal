// @ts-check
import { HOME_BY_ROLE, LOGIN_PATH, SUPPORTED_LANGS } from '../core/config.js';
import { h, icon, replaceContent } from '../core/dom.js';
import { errorKey, toApiError } from '../core/errors.js';
import { getLang, onLangChange, setLang, t } from '../core/i18n.js';
import { THEMES, getTheme, onThemeChange, setTheme } from '../core/theme.js';
import { logout } from '../services/auth.js';
import { setBusy } from './form.js';
import { showToast } from './toast.js';
/** @import { Role, User } from '../core/types.js' */

/** @typedef {{ href: string, key: string }} NavLink */

const REGISTER_PATH = '/register.html';

/** @type {readonly NavLink[]} */
export const PUBLIC_LINKS = Object.freeze([
  { href: '/lab/', key: 'nav.lab' },
  { href: '/security.html', key: 'nav.security' },
]);

/** @type {Readonly<Record<Role, readonly NavLink[]>>} */
const ROLE_LINKS = Object.freeze({
  artist: [
    { href: HOME_BY_ROLE.artist, key: 'nav.demos' },
    { href: '/portal/upload.html', key: 'nav.upload' },
  ],
  admin: [{ href: HOME_BY_ROLE.admin, key: 'nav.admin' }],
});

/** @type {(() => void) | null} */
let stopLangSync = null;
/** @type {(() => void) | null} */
let stopThemeSync = null;

/**
 * The team's work is the review desk, so an admin's menu holds only that; the pages written for
 * artists and guests stay reachable from the home page.
 * @param {User | null} user
 * @returns {NavLink[]}
 */
export function navLinks(user) {
  if (user?.role === 'admin') return [...ROLE_LINKS.admin];
  return [...(user ? ROLE_LINKS[user.role] ?? [] : []), ...PUBLIC_LINKS];
}

/**
 * The portal's own pages for this visitor: their area when signed in, otherwise the way in.
 * @param {User | null} user
 * @returns {readonly NavLink[]}
 */
export function portalLinks(user) {
  if (user) return ROLE_LINKS[user.role] ?? [];
  return [
    { href: LOGIN_PATH, key: 'nav.login' },
    { href: REGISTER_PATH, key: 'nav.register' },
  ];
}

/**
 * aria-current for a link: 'page' on the page itself, 'true' anywhere inside a section link.
 * @param {string} href
 * @param {string} pathname
 * @returns {'page' | 'true' | null}
 */
export function currentState(href, pathname) {
  const path = pathname.replace(/\/index\.html$/, '/');
  if (path === href) return 'page';
  if (href.endsWith('/') && path.startsWith(href)) return 'true';
  return null;
}

/** @param {{ link?: boolean }} [options] */
export function wordmark({ link = true } = {}) {
  const [before, after] = t('common.brand').split('/');
  const parts = [before, h('span', { class: 'wordmark__slash', 'aria-hidden': 'true' }, '/'), after];
  if (!link) return h('p', { class: 'wordmark' }, parts);
  return h('a', { class: 'wordmark', href: '/', i18nAttr: { 'aria-label': 'common.homeLink' } }, parts);
}

/** @param {User | null} user */
export function renderHeader(user) {
  const host = document.getElementById('site-header');
  if (!host) return;
  host.classList.add('site-header');
  host.removeAttribute('data-menu-open');

  const toggle = h('button', {
    type: 'button',
    class: 'menu-toggle',
    'aria-expanded': 'false',
    'aria-controls': 'site-menu',
    i18n: 'nav.menu',
  });

  /** @param {boolean} open */
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    host.toggleAttribute('data-menu-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));

  const menu = h(
    'div',
    { class: 'site-menu', id: 'site-menu' },
    h(
      'nav',
      { class: 'site-nav', i18nAttr: { 'aria-label': 'nav.main' } },
      h(
        'ul',
        { class: 'site-nav__list' },
        navLinks(user).map((link) => h('li', {}, navLink(link))),
      ),
    ),
    account(user),
    h('div', { class: 'site-menu__prefs' }, themeSwitch(), languageSwitch()),
  );

  replaceContent(
    host,
    h(
      'div',
      {
        class: 'container site-header__bar',
        on: {
          keydown: (event) => {
            if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
            setOpen(false);
            toggle.focus();
          },
        },
      },
      wordmark(),
      toggle,
      menu,
    ),
  );
}

/**
 * While the sticky header lies on a dark scene at the top of the page (the home hero, the upload
 * page's head) it is dark glass over it (components.css); once the scene has scrolled out from
 * under it, it is the page's own frosted bar again.
 * @param {HTMLElement} scene
 */
export function glassOver(scene) {
  const header = document.getElementById('site-header');
  if (!header) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    header.toggleAttribute('data-over-scene', scene.getBoundingClientRect().bottom > header.offsetHeight);
  };
  update();
  addEventListener('scroll', () => (frame ||= requestAnimationFrame(update)), { passive: true });
  addEventListener('resize', update);
}

/** @param {NavLink} link */
function navLink({ href, key }) {
  return h('a', {
    class: 'site-nav__link',
    href,
    'aria-current': currentState(href, location.pathname),
    i18n: key,
  });
}

/** @param {User | null} user */
function account(user) {
  if (!user) {
    return h(
      'div',
      { class: 'account' },
      h('a', {
        class: 'btn btn--ghost',
        href: LOGIN_PATH,
        'aria-current': currentState(LOGIN_PATH, location.pathname),
        i18n: 'nav.login',
      }),
      h('a', {
        class: 'btn btn--primary',
        href: REGISTER_PATH,
        'aria-current': currentState(REGISTER_PATH, location.pathname),
        i18n: 'nav.register',
      }),
    );
  }
  const signOutButton = h('button', { type: 'button', class: 'btn btn--secondary', i18n: 'nav.logout' });
  signOutButton.addEventListener('click', () => void signOut(signOutButton));
  return h(
    'div',
    { class: 'account' },
    h(
      'p',
      { class: 'account__user' },
      h('span', { class: 'account__avatar', 'aria-hidden': 'true', text: initials(user.displayName) }),
      h('span', { class: 'visually-hidden', i18n: 'nav.signedInAs' }),
      ' ',
      h('span', { class: 'account__name', text: user.displayName }),
    ),
    signOutButton,
  );
}

/**
 * Up to two initials for the badge beside the name; it still says who is signed in where the
 * name itself has no room.
 * @param {string} name
 */
function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toLocaleUpperCase(getLang());
}

/** @param {HTMLButtonElement} button */
async function signOut(button) {
  if (button.getAttribute('aria-busy') === 'true') return;
  setBusy(button, true);
  try {
    await logout();
    location.assign(LOGIN_PATH);
  } catch (error) {
    setBusy(button, false);
    showToast(t(errorKey(toApiError(error).code)), { tone: 'danger' });
  }
}

// The pressed button is the theme in use, so on a first visit it shows what the system chose.
function themeSwitch() {
  const buttons = THEMES.map((theme) =>
    h(
      'button',
      {
        type: 'button',
        class: 'theme-switch__option',
        dataset: { theme },
        'aria-pressed': String(theme === getTheme()),
        i18nAttr: { 'aria-label': `nav.themes.${theme}`, title: `nav.themes.${theme}` },
        on: { click: () => setTheme(theme) },
      },
      icon(`theme-${theme}`),
    ),
  );
  stopThemeSync?.();
  stopThemeSync = onThemeChange((current) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.theme === current));
  });
  return h('div', { class: 'theme-switch', role: 'group', i18nAttr: { 'aria-label': 'nav.theme' } }, buttons);
}

function languageSwitch() {
  const buttons = SUPPORTED_LANGS.map((lang) =>
    h(
      'button',
      {
        type: 'button',
        class: 'lang-switch__option',
        lang,
        'aria-pressed': String(lang === getLang()),
        i18nAttr: { title: `nav.languages.${lang}` },
        on: { click: () => void setLang(lang) },
      },
      lang.toUpperCase(),
    ),
  );
  stopLangSync?.();
  stopLangSync = onLangChange((current) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.lang === current));
  });
  return h(
    'div',
    { class: 'lang-switch', role: 'group', i18nAttr: { 'aria-label': 'nav.language' } },
    buttons,
  );
}
