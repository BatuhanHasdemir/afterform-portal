// @ts-check
import { bootPage, homeFor } from '../core/guard.js';

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
}
