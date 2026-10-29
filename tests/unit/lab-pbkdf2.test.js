import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { describe, test } from 'node:test';
import { SETTINGS } from '../../dev-mock/settings.mjs';
import { PBKDF2_PROJECT_ITERATIONS } from '../../web/js/core/config.js';
import { bytesToHex } from '../../web/js/lab/hex.js';
import {
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  OUTPUT_BITS,
  SALT_BYTES,
  SLIDER_STEPS,
  derive,
  iterationsAt,
  positionOf,
  randomSalt,
} from '../../web/js/lab/pbkdf2.js';

describe('derive (Web Crypto) against Node pbkdf2Sync', () => {
  const cases = [
    ['örnek parola', 1000],
    ['', 1000],
    ['İğne ve ŞİŞ 🔒', 2500],
    ['x'.repeat(200), 1500],
  ];
  for (const [password, iterations] of cases) {
    test(`${JSON.stringify(password.slice(0, 20))}, ${iterations} iterations`, async () => {
      const salt = randomSalt();
      const { bytes, ms } = await derive({ password, salt, iterations });
      const expected = pbkdf2Sync(password, salt, iterations, OUTPUT_BITS / 8, 'sha512');
      assert.equal(bytesToHex(bytes), expected.toString('hex'));
      assert.ok(ms >= 0);
    });
  }

  test('the same password with two different salts gives different outputs', async () => {
    const [a, b] = [randomSalt(), randomSalt()];
    assert.notDeepEqual(a, b);
    const first = await derive({ password: 'aynı parola', salt: a, iterations: 1000 });
    const second = await derive({ password: 'aynı parola', salt: b, iterations: 1000 });
    assert.notEqual(bytesToHex(first.bytes), bytesToHex(second.bytes));
    const again = await derive({ password: 'aynı parola', salt: a, iterations: 1000 });
    assert.equal(bytesToHex(again.bytes), bytesToHex(first.bytes), 'same salt, same output');
  });
});

describe('iteration slider', () => {
  test('spans 1,000 to 1,000,000; every step changes the value by a similar factor', () => {
    assert.equal(MIN_ITERATIONS, 1_000);
    assert.equal(MAX_ITERATIONS, 1_000_000);
    assert.equal(iterationsAt(0), MIN_ITERATIONS);
    assert.equal(iterationsAt(SLIDER_STEPS), MAX_ITERATIONS);
    assert.equal(iterationsAt(-5), MIN_ITERATIONS);
    assert.equal(iterationsAt(SLIDER_STEPS + 5), MAX_ITERATIONS);
    for (let position = 1; position <= SLIDER_STEPS; position += 1) {
      const ratio = iterationsAt(position) / iterationsAt(position - 1);
      assert.ok(ratio > 1.09 && ratio < 1.3, `step ${position}: ×${ratio.toFixed(2)}`);
    }
  });

  test('reaches the project setting exactly, and decades too', () => {
    assert.equal(iterationsAt(positionOf(PBKDF2_PROJECT_ITERATIONS)), PBKDF2_PROJECT_ITERATIONS);
    for (const value of [1000, 10_000, 100_000, 1_000_000]) {
      assert.equal(iterationsAt(positionOf(value)), value, String(value));
    }
    assert.equal(iterationsAt(positionOf(500_000)), 470_000, 'values between stops snap to the nearest one');
  });
});

test('the Lab, the frontend config and the mock agree on 220,000 iterations', () => {
  assert.equal(PBKDF2_PROJECT_ITERATIONS, 220_000);
  assert.equal(SETTINGS.password.iterations, PBKDF2_PROJECT_ITERATIONS);
  assert.equal(SETTINGS.password.keyBytes * 8, OUTPUT_BITS);
  assert.equal(SETTINGS.password.saltBytes, SALT_BYTES);
});

test('randomSalt returns fresh 16-byte salts', () => {
  const salts = new Set(Array.from({ length: 20 }, () => bytesToHex(randomSalt())));
  assert.equal(salts.size, 20);
  assert.equal(randomSalt().length, 16);
});
