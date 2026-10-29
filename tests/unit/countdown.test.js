import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { formatClock, startCountdown } from '../../web/js/components/countdown.js';

afterEach(() => {
  mock.timers.reset();
});

test('formatClock prints minutes and zero-padded seconds', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9), '0:09');
  assert.equal(formatClock(60), '1:00');
  assert.equal(formatClock(899), '14:59');
  assert.equal(formatClock(900), '15:00');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(1.2), '0:02');
});

test('counts down to zero and calls onDone exactly once', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const el = { textContent: '' };
  let done = 0;
  startCountdown(el, 3, () => {
    done += 1;
  });
  assert.equal(el.textContent, '0:03');
  mock.timers.tick(1000);
  assert.equal(el.textContent, '0:02');
  mock.timers.tick(2000);
  assert.equal(el.textContent, '0:00');
  assert.equal(done, 1);
  mock.timers.tick(5000);
  assert.equal(done, 1);
});

test('reads the clock, so one late tick after a throttled pause still ends on time', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const el = { textContent: '' };
  let done = 0;
  startCountdown(el, 900, () => {
    done += 1;
  });
  mock.timers.setTime(900_000);
  assert.equal(el.textContent, '15:00', 'no tick has run yet');
  mock.timers.tick(250);
  assert.equal(el.textContent, '0:00');
  assert.equal(done, 1);
});

test('the returned function stops the countdown', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const el = { textContent: '' };
  let done = 0;
  const stop = startCountdown(el, 2, () => {
    done += 1;
  });
  stop();
  mock.timers.tick(5000);
  assert.equal(el.textContent, '0:02');
  assert.equal(done, 0);
});
