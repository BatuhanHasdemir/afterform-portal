// @ts-check
import { h } from '../core/dom.js';

/** @typedef {'sha256' | 'pbkdf2' | 'salt' | 'iterations'} SecurityCard */

/** @type {Readonly<Record<SecurityCard, { title: string, body: string }>>} */
const CARD_KEYS = Object.freeze({
  sha256: { title: 'security.cards.sha256.title', body: 'security.cards.sha256.body' },
  pbkdf2: { title: 'security.cards.pbkdf2.title', body: 'security.cards.pbkdf2.body' },
  salt: { title: 'security.cards.salt.title', body: 'security.cards.salt.body' },
  iterations: { title: 'security.cards.iterations.title', body: 'security.cards.iterations.body' },
});

/**
 * A closed-by-default <details> card with the security texts of ARCHITECTURE Ek A.
 * @param {{ titleKey: string, cards: SecurityCard[] }} options
 */
export function infoCard({ titleKey, cards }) {
  return h(
    'details',
    { class: 'info-card' },
    h('summary', { class: 'info-card__summary', i18n: titleKey }),
    h(
      'dl',
      { class: 'info-card__list' },
      cards.map((card) =>
        h(
          'div',
          { class: 'info-card__item' },
          h('dt', { class: 'info-card__term', i18n: CARD_KEYS[card].title }),
          h('dd', { class: 'info-card__text', i18n: CARD_KEYS[card].body }),
        ),
      ),
    ),
  );
}

/** The "How is your password protected?" card of the sign-in and registration pages. */
export function passwordInfoCard() {
  return infoCard({ titleKey: 'security.passwordCard', cards: ['pbkdf2', 'salt', 'iterations'] });
}
