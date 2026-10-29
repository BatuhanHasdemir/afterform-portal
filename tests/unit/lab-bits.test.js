import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { add32, bitAt, diffBits, flipBit, popcount8, rotl, rotr, shr } from '../../web/js/lab/bits.js';
import { binary8, bytesToWords, hex32, hex8, utf8Bytes, wordsToBytes } from '../../web/js/lab/hex.js';

test('rotr and shr on 32-bit words', () => {
  assert.equal(rotr(0x00000001, 1), 0x80000000);
  assert.equal(rotr(0x80000000, 31), 0x00000001);
  assert.equal(rotr(0x12345678, 8), 0x78123456);
  assert.equal(rotr(0xffffffff, 7), 0xffffffff);
  assert.equal(shr(0x80000000, 31), 1);
  assert.equal(shr(0xf0000000, 4), 0x0f000000);
});

test('rotl is the mirror of rotr', () => {
  assert.equal(rotl(0x80000000, 1), 0x00000001);
  assert.equal(rotl(0x12345678, 8), 0x34567812);
  assert.equal(rotl(0xdeadbeef, 0), 0xdeadbeef);
  for (const n of [1, 5, 13, 30, 31]) assert.equal(rotl(0x9e3779b9, n), rotr(0x9e3779b9, 32 - n));
});

test('add32 wraps around 2^32', () => {
  assert.equal(add32(0xffffffff, 1), 0);
  assert.equal(add32(0x80000000, 0x80000000, 5), 5);
  assert.equal(add32(), 0);
});

test('bits are numbered from the most significant bit of byte 0', () => {
  const bytes = Uint8Array.of(0b1000_0001, 0b0000_0010);
  assert.equal(bitAt(bytes, 0), 1);
  assert.equal(bitAt(bytes, 7), 1);
  assert.equal(bitAt(bytes, 14), 1);
  assert.equal(bitAt(bytes, 15), 0);
  assert.deepEqual([...flipBit(bytes, 0)], [0b0000_0001, 0b0000_0010]);
  assert.deepEqual([...flipBit(bytes, 15)], [0b1000_0001, 0b0000_0011]);
  assert.deepEqual([...bytes], [0b1000_0001, 0b0000_0010], 'the input is left untouched');
  assert.throws(() => flipBit(bytes, 16), RangeError);
  assert.throws(() => flipBit(bytes, -1), RangeError);
});

test('diffBits counts differing bits', () => {
  assert.equal(popcount8(0xff), 8);
  assert.equal(popcount8(0), 0);
  const { xor, changed } = diffBits(Uint8Array.of(0xff, 0x0f), Uint8Array.of(0x0f, 0x0f));
  assert.deepEqual([...xor], [0xf0, 0]);
  assert.equal(changed, 4);
  const a = createHash('sha256').update('abc').digest();
  const b = createHash('sha256').update('abb').digest();
  const expected = [...a].reduce((sum, byte, i) => sum + [...(byte ^ b[i]).toString(2)].filter((d) => d === '1').length, 0);
  assert.equal(diffBits(a, b).changed, expected);
  assert.throws(() => diffBits(Uint8Array.of(1), Uint8Array.of(1, 2)), RangeError);
});

test('hex helpers and UTF-8', () => {
  assert.equal(hex8(10), '0a');
  assert.equal(hex32(0xabc), '00000abc');
  assert.equal(binary8(0x63), '01100011');
  assert.deepEqual([...utf8Bytes('ğ')], [0xc4, 0x9f]);
  assert.deepEqual(bytesToWords(Uint8Array.of(0x61, 0x62, 0x63, 0x80, 0, 0, 0, 1)), [0x61626380, 1]);
  assert.deepEqual([...wordsToBytes([0x61626380])], [0x61, 0x62, 0x63, 0x80]);
});
