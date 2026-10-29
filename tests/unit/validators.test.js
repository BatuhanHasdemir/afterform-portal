import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SETTINGS } from '../../dev-mock/settings.mjs';
import { UPLOAD_RULES, VERIFY_MAX_BYTES } from '../../web/js/core/config.js';
import {
  normalizeEmail,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validateFile,
  validateGenre,
  validateNote,
  validatePassword,
  validateStatus,
  validateStatusNote,
  validateTitle,
} from '../../web/js/core/validators.js';

const file = (name, size, type) => ({ name, size, type });

describe('validateFile', () => {
  test('the project accepts MP3 files up to 100 MB', () => {
    assert.deepEqual(UPLOAD_RULES, {
      allowedExtensions: ['mp3'],
      allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
      maxBytes: 100_000_000,
    });
    assert.equal(validateFile(file('demo.mp3', 5_000_000, 'audio/mpeg')), null);
    assert.equal(validateFile(file('Demo.MP3', 100_000_000, 'audio/mp3')), null);
    assert.equal(validateFile(file('demo.mp3', 100_000_001, 'audio/mpeg')), 'too_large');
    assert.equal(validateFile(file('demo.wav', 5_000_000, 'audio/wav')), 'unsupported_type');
    assert.equal(validateFile(file('notes.txt', 12, 'text/plain')), 'unsupported_type');
    assert.equal(validateFile(file('demo.mp3.exe', 12, '')), 'unsupported_type');
  });

  test('the mock server and the in-browser hash check use the same size limit', () => {
    assert.equal(SETTINGS.maxUploadBytes, UPLOAD_RULES.maxBytes);
    assert.equal(VERIFY_MAX_BYTES, UPLOAD_RULES.maxBytes);
  });

  test('an empty browser-reported type falls back to the extension', () => {
    assert.equal(validateFile(file('demo.mp3', 1000, '')), null);
    assert.equal(validateFile(file('demo.wav', 1000, '')), 'unsupported_type');
  });

  test('empty rule lists and a null size switch the checks off', () => {
    const open = { allowedExtensions: [], allowedMimeTypes: [], maxBytes: null };
    assert.equal(validateFile(file('notes.txt', 12, 'text/plain'), open), null);
    assert.equal(validateFile(file('huge.flac', 5_000_000_000, 'audio/flac'), open), null);
    assert.equal(validateFile(file('no-extension', 1, ''), open), null);
  });

  test('a missing or empty file is always required', () => {
    assert.equal(validateFile(null), 'required');
    assert.equal(validateFile(undefined), 'required');
    assert.equal(validateFile(file('empty.wav', 0, 'audio/wav')), 'required');
  });

  test('with rules, size, extension and type are enforced', () => {
    const rules = { allowedExtensions: ['wav', 'mp3'], allowedMimeTypes: ['audio/wav', 'audio/mpeg'], maxBytes: 1000 };
    assert.equal(validateFile(file('take.wav', 1000, 'audio/wav'), rules), null);
    assert.equal(validateFile(file('TAKE.MP3', 10, 'AUDIO/MPEG'), rules), null);
    assert.equal(validateFile(file('take.wav', 1001, 'audio/wav'), rules), 'too_large');
    assert.equal(validateFile(file('take.flac', 10, 'audio/flac'), rules), 'unsupported_type');
    assert.equal(validateFile(file('take.wav', 10, 'text/html'), rules), 'unsupported_type');
    assert.equal(validateFile(file('wav', 10, 'audio/wav'), rules), 'unsupported_type');
    assert.equal(validateFile(file('take.wav', 10, ''), rules), null, 'unknown type: the extension decides');
  });

  test('each rule works on its own', () => {
    const sizeOnly = { allowedExtensions: [], allowedMimeTypes: [], maxBytes: 100 };
    assert.equal(validateFile(file('a.txt', 100, 'text/plain'), sizeOnly), null);
    assert.equal(validateFile(file('a.txt', 101, 'text/plain'), sizeOnly), 'too_large');
    const extensionOnly = { allowedExtensions: ['wav'], allowedMimeTypes: [], maxBytes: null };
    assert.equal(validateFile(file('a.wav', 1, 'application/octet-stream'), extensionOnly), null);
    assert.equal(validateFile(file('a.mp3', 1, 'audio/mpeg'), extensionOnly), 'unsupported_type');
  });
});

describe('safeNextPath', () => {
  const fallback = '/portal/demos.html';

  test('keeps same-origin relative paths', () => {
    assert.equal(safeNextPath('/portal/demo.html?id=42', fallback), '/portal/demo.html?id=42');
    assert.equal(safeNextPath('/admin/', fallback), '/admin/');
    assert.equal(safeNextPath('/admin/?q=caf%C3%A9', fallback), '/admin/?q=caf%C3%A9');
  });

  test('rejects anything that could leave the origin', () => {
    const hostile = [
      '//evil.example',
      'https://evil.example/',
      'http:/evil.example',
      'evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/a//b',
      '/%2F%2Fevil.example',
      '/%2f%2fevil.example',
      '/%5Cevil.example',
      '/%09/evil.example',
      '/%E0%A4%A',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ];
    for (const value of hostile) assert.equal(safeNextPath(value, fallback), fallback, String(value));
  });
});

describe('field validators', () => {
  test('display name: trimmed, 2-60 characters', () => {
    assert.equal(validateDisplayName(undefined), 'required');
    assert.equal(validateDisplayName('   '), 'required');
    assert.equal(validateDisplayName(' A '), 'too_short');
    assert.equal(validateDisplayName('Ab'), null);
    assert.equal(validateDisplayName('x'.repeat(60)), null);
    assert.equal(validateDisplayName('x'.repeat(61)), 'too_long');
    assert.equal(validateDisplayName(42), 'invalid_value');
  });

  test('e-mail: format and at most 254 characters', () => {
    assert.equal(validateEmail(''), 'required');
    assert.equal(validateEmail('artist@afterform.test'), null);
    assert.equal(validateEmail('  artist@afterform.test  '), null);
    for (const bad of ['artist', 'artist@', '@afterform.test', 'a b@c.de', 'artist@afterform']) {
      assert.equal(validateEmail(bad), 'invalid_format', bad);
    }
    assert.equal(validateEmail(`${'a'.repeat(245)}@test.com`), null);
    assert.equal(validateEmail(`${'a'.repeat(246)}@test.com`), 'too_long');
  });

  test('password: 12-128 characters, not trimmed, no composition rule', () => {
    assert.equal(validatePassword(''), 'required');
    assert.equal(validatePassword('x'.repeat(11)), 'too_short');
    assert.equal(validatePassword('aaaaaaaaaaaa'), null);
    assert.equal(validatePassword('           x'), null);
    assert.equal(validatePassword('x'.repeat(128)), null);
    assert.equal(validatePassword('x'.repeat(129)), 'too_long');
  });

  test('title, note and status note limits', () => {
    assert.equal(validateTitle(''), 'required');
    assert.equal(validateTitle('x'.repeat(120)), null);
    assert.equal(validateTitle('x'.repeat(121)), 'too_long');
    assert.equal(validateNote(undefined), null);
    assert.equal(validateNote(''), null);
    assert.equal(validateNote('x'.repeat(1001)), 'too_long');
    assert.equal(validateStatusNote(null), null);
    assert.equal(validateStatusNote('x'.repeat(500)), null);
    assert.equal(validateStatusNote('x'.repeat(501)), 'too_long');
  });

  test('genre and status must come from the configured lists', () => {
    assert.equal(validateGenre('ambient'), null);
    assert.equal(validateGenre('polka'), 'invalid_value');
    assert.equal(validateGenre(''), 'required');
    assert.equal(validateStatus('in_review'), null);
    assert.equal(validateStatus('approved'), 'invalid_value');
    assert.equal(validateStatus(['accepted']), 'invalid_value');
  });

  test('e-mails are compared trimmed and lower-cased', () => {
    assert.equal(normalizeEmail('  Artist@AfterForm.Test '), 'artist@afterform.test');
  });
});
