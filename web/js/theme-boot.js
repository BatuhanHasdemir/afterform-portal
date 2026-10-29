// @ts-check
// A plain script loaded in <head> before the stylesheets, so a theme chosen on this site is in
// place before the first paint instead of flashing the system theme first.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage can be blocked; the system preference applies then.
}
