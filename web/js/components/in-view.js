// @ts-check

/**
 * Runs `play` once, when the element first comes into view, and marks it with data-inview so
 * its CSS transitions can start at the same moment. With reduced motion it runs at once: the
 * element then simply shows its final state.
 * @param {HTMLElement} element
 * @param {() => void} [play]
 * @param {{ threshold?: number }} [options]
 */
export function whenInView(element, play = () => {}, { threshold = 0.4 } = {}) {
  const start = () => {
    element.dataset.inview = '';
    play();
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
    start();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      start();
    },
    { threshold },
  );
  observer.observe(element);
}
