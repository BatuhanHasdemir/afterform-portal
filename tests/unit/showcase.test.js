import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PBKDF2_PROJECT_ITERATIONS } from '../../web/js/core/config.js';
import { ITERATION_STEPS } from '../../web/js/components/iteration-bars.js';
import { waveform } from '../../web/js/components/signal.js';

test('the hero waveform: 32 bars, every one visible, the same every time', () => {
  const bars = waveform();
  assert.equal(bars.length, 32);
  assert.ok(bars.every((height) => height >= 0.05 && height <= 1), JSON.stringify(bars));
  assert.deepEqual(waveform(), bars);
  // It swells and fades: the ends are lower than the middle.
  const middle = Math.max(...bars.slice(10, 22));
  assert.ok(bars[0] < middle && bars.at(-1) < middle);
});

test('the iteration bars include the project setting, in ascending order', () => {
  assert.ok(ITERATION_STEPS.includes(PBKDF2_PROJECT_ITERATIONS));
  assert.deepEqual([...ITERATION_STEPS].sort((a, b) => a - b), [...ITERATION_STEPS]);
});
