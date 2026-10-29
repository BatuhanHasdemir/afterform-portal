import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { currentState, navLinks } from '../../web/js/components/header.js';

const artist = { id: '1', email: 'a@afterform.test', displayName: 'A', role: 'artist' };
const admin = { id: '2', email: 'b@afterform.test', displayName: 'B', role: 'admin' };

describe('navLinks', () => {
  const hrefs = (user) => navLinks(user).map((link) => link.href);

  test('guests see only the public pages', () => {
    assert.deepEqual(hrefs(null), ['/lab/', '/security.html']);
  });

  test('signed-in users get their own area first', () => {
    assert.deepEqual(hrefs(artist), ['/portal/demos.html', '/portal/upload.html', '/lab/', '/security.html']);
    assert.deepEqual(hrefs(admin), ['/admin/', '/lab/', '/security.html']);
  });
});

describe('currentState', () => {
  test('marks the page itself, with or without index.html', () => {
    assert.equal(currentState('/security.html', '/security.html'), 'page');
    assert.equal(currentState('/admin/', '/admin/'), 'page');
    assert.equal(currentState('/admin/', '/admin/index.html'), 'page');
  });

  test('marks pages inside a section link', () => {
    assert.equal(currentState('/lab/', '/lab/sha256.html'), 'true');
  });

  test('leaves unrelated links alone', () => {
    assert.equal(currentState('/lab/', '/'), null);
    assert.equal(currentState('/portal/demos.html', '/portal/upload.html'), null);
    assert.equal(currentState('/security.html', '/security.html.bak'), null);
  });
});
