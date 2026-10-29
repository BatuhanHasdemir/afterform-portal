// @ts-check

/** @param {number} totalSeconds */
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Shows m:ss counting down to zero. The remaining time is read from the clock on every tick
 * instead of counting ticks, so a throttled background tab still finishes on time.
 * @param {HTMLElement} el use role="timer", which screen readers do not announce on every change
 * @param {number} seconds
 * @param {() => void} [onDone]
 * @returns {() => void} stops the countdown early
 */
export function startCountdown(el, seconds, onDone) {
  const endsAt = Date.now() + seconds * 1000;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  const stop = () => clearInterval(timer);
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const text = formatClock(left);
    if (el.textContent !== text) el.textContent = text;
    if (left === 0) {
      stop();
      onDone?.();
    }
  };
  timer = setInterval(tick, 250);
  tick();
  return stop;
}
