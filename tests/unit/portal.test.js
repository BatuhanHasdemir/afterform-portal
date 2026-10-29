import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { groupHex } from '../../web/js/components/digest.js';
import { displayFileName } from '../../web/js/components/file-drop.js';
import { barHeights } from '../../web/js/components/fingerprint.js';
import { pageInfo } from '../../web/js/components/pager.js';
import { listQueryString, readListQuery } from '../../web/js/services/demos.js';

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('digest', () => {
  test('groups the 64 hex digits into eight groups of eight', () => {
    const groups = groupHex(ABC_SHA256);
    assert.equal(groups.length, 8);
    assert.ok(groups.every((group) => group.length === 8));
    assert.equal(groups[0], 'ba7816bf');
    assert.equal(groups.join(''), ABC_SHA256);
  });
});

describe('fingerprint', () => {
  test('one bar per byte, its height the byte value over 255', () => {
    const heights = barHeights(ABC_SHA256);
    assert.equal(heights.length, 32);
    assert.equal(heights[0], 0xba / 255);
    assert.equal(heights[31], 0xad / 255);
    assert.deepEqual(barHeights('00ff'), [0, 1]);
  });

  test('the same digest always draws the same pattern', () => {
    assert.deepEqual(barHeights(ABC_SHA256), barHeights(ABC_SHA256.toUpperCase()));
  });
});

describe('pageInfo', () => {
  test('describes the visible range and the neighbours', () => {
    assert.deepEqual(pageInfo({ page: 2, pageSize: 2, total: 3 }), {
      page: 2,
      pages: 2,
      from: 3,
      to: 3,
      hasPrev: true,
      hasNext: false,
    });
    assert.deepEqual(pageInfo({ page: 1, pageSize: 20, total: 0 }), {
      page: 1,
      pages: 1,
      from: 0,
      to: 0,
      hasPrev: false,
      hasNext: false,
    });
  });

  test('clamps a page outside the range', () => {
    assert.equal(pageInfo({ page: 9, pageSize: 10, total: 25 }).page, 3);
    assert.equal(pageInfo({ page: 0, pageSize: 10, total: 25 }).page, 1);
  });
});

describe('list query in the address', () => {
  test('reads valid values and drops everything the API would reject', () => {
    assert.deepEqual(readListQuery(new URLSearchParams('status=accepted&sort=title&page=2&pageSize=5')), {
      status: 'accepted',
      sort: 'title',
      page: 2,
      pageSize: 5,
    });
    assert.deepEqual(readListQuery(new URLSearchParams('status=lost&sort=random&page=0&pageSize=500')), {
      status: null,
      sort: 'newest',
      page: 1,
      pageSize: 20,
    });
    assert.deepEqual(readListQuery(new URLSearchParams('page=-1&pageSize=2.5')), {
      status: null,
      sort: 'newest',
      page: 1,
      pageSize: 20,
    });
  });

  test('writes only what differs from the defaults', () => {
    assert.equal(listQueryString({ status: null, sort: 'newest', page: 1, pageSize: 20 }), '');
    assert.equal(
      listQueryString({ status: 'in_review', sort: 'oldest', page: 3, pageSize: 10 }),
      '?status=in_review&sort=oldest&page=3&pageSize=10',
    );
  });
});

test('file names are shown without path components', () => {
  assert.equal(displayFileName('C:\\Users\\me\\take 1.wav'), 'take 1.wav');
  assert.equal(displayFileName('/home/me/take.wav'), 'take.wav');
  assert.equal(displayFileName('take.wav'), 'take.wav');
});
