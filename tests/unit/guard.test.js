import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginLink } from '../../web/js/core/guard.js';

test('loginLink carries a safe next and a one-time notice', () => {
  assert.equal(loginLink(), '/login.html');
  assert.equal(loginLink({ notice: 'registered' }), '/login.html?notice=registered');
  assert.equal(
    loginLink({ next: '/portal/demo.html?id=7', notice: 'password_reset' }),
    '/login.html?notice=password_reset&next=%2Fportal%2Fdemo.html%3Fid%3D7',
  );
});

test('loginLink drops a next that could leave the site', () => {
  for (const next of ['//evil.example', 'https://evil.example/', '/\\evil.example', 'evil.example', null]) {
    assert.equal(loginLink({ next }), '/login.html', String(next));
  }
});
