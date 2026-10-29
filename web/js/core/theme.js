// @ts-check

/** @typedef {'light' | 'dark'} Theme */

const STORAGE_KEY = 'theme';

/** @type {readonly Theme[]} */
export const THEMES = Object.freeze(['light', 'dark']);

/** @type {Set<(theme: Theme) => void>} */
const listeners = new Set();
let watchingSystem = false;

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * The theme in use: the one chosen on this site, otherwise the system's.
 * @returns {Theme}
 */
export function getTheme() {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'light' || theme === 'dark') return theme;
  return systemDark() ? 'dark' : 'light';
}

/**
 * Remembered on this device only. Until something is chosen the page follows the system.
 * @param {Theme} theme
 */
export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Without storage the choice still applies to this page.
  }
  const apply = () => {
    document.documentElement.dataset.theme = theme;
  };
  // A short cross-fade instead of a hard cut, where the browser can do it and motion is welcome.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition === 'function' && !reduce) document.startViewTransition(apply);
  else apply();
  notify();
}

function notify() {
  const theme = getTheme();
  for (const listener of listeners) listener(theme);
}

/**
 * Also called when the system theme changes while nothing has been chosen here.
 * @param {(theme: Theme) => void} listener
 * @returns {() => void} stops listening
 */
export function onThemeChange(listener) {
  if (!watchingSystem) {
    watchingSystem = true;
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (!document.documentElement.dataset.theme) notify();
    });
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}
