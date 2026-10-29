import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { bytesToHex, hexToBytes } from '../../web/js/lab/hex.js';

test('hex and bytes convert both ways', () => {
  assert.deepEqual([...hexToBytes('00ff7f80')], [0, 255, 127, 128]);
  assert.deepEqual([...hexToBytes('ABcd')], [0xab, 0xcd]);
  assert.equal(bytesToHex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
  assert.equal(hexToBytes('').length, 0);
  for (let i = 0; i < 50; i += 1) {
    const bytes = randomBytes(i);
    assert.equal(bytesToHex(hexToBytes(bytes.toString('hex'))), bytes.toString('hex'));
  }
});

test('malformed hex is rejected instead of silently misread', () => {
  for (const bad of ['abc', 'zz', '0x12', ' 12', '12 ']) {
    assert.throws(() => hexToBytes(bad), TypeError, bad);
  }
});
