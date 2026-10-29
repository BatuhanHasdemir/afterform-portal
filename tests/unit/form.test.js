import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkFields, messageFor, passwordStrength } from '../../web/js/components/form.js';
import { validateEmail, validatePassword } from '../../web/js/core/validators.js';

describe('checkFields', () => {
  const rules = {
    email: { validate: validateEmail },
    password: { validate: validatePassword, limits: { min: 12, max: 128 } },
  };

  test('reports the first problem of each failing field, with message parameters', () => {
    const problems = checkFields({ email: 'nope', password: 'short' }, rules);
    assert.deepEqual([...problems.keys()], ['email', 'password']);
    assert.deepEqual(problems.get('email'), { key: 'errors.field.invalid_format', params: { min: 0, max: 0 } });
    assert.deepEqual(problems.get('password'), { key: 'errors.field.too_short', params: { min: 12, max: 128 } });
  });

  test('valid values pass; a missing value counts as empty', () => {
    assert.equal(checkFields({ email: 'a@b.co', password: 'x'.repeat(12) }, rules).size, 0);
    assert.equal(checkFields({}, rules).get('email')?.key, 'errors.field.required');
  });

  test('server field codes become the same messages', () => {
    assert.deepEqual(messageFor('too_long', rules.password), {
      key: 'errors.field.too_long',
      params: { min: 12, max: 128 },
    });
  });
});

describe('passwordStrength', () => {
  test('length comes first', () => {
    assert.deepEqual(passwordStrength('', 12), { level: 'empty', missing: 12 });
    assert.deepEqual(passwordStrength('abc', 12), { level: 'short', missing: 9 });
    assert.deepEqual(passwordStrength('abcdefghijkl', 12), { level: 'fair', missing: 0 });
    assert.equal(passwordStrength('abcdefghijklmnop', 12).level, 'strong');
  });

  test('variety counts at the minimum length, Turkish letters included', () => {
    assert.equal(passwordStrength('Abcdefghijk1', 12).level, 'strong');
    assert.equal(passwordStrength('çalışkanlık1', 12).level, 'fair');
    assert.equal(passwordStrength('Çalışkanlık!', 12).level, 'strong');
  });

  test('never demands a composition: a long single-class password is strong', () => {
    assert.equal(passwordStrength('correct horse battery staple', 12).level, 'strong');
  });
});
