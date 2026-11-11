import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMAGE_URL, sniffImage } from './media';

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

test('image type comes from the magic bytes', () => {
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sniffImage(bytes(0x89, 'PNG', 0x0d, 0x0a)), 'image/png');
  assert.equal(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP')), 'image/webp');
  assert.equal(sniffImage(bytes('GIF89a')), 'image/gif');
  assert.equal(sniffImage(bytes('<svg onload=alert(1)>')), null);
  assert.equal(sniffImage(bytes('<html>')), null);
});

test('profile image URLs are uploads or https', () => {
  assert.ok(IMAGE_URL.test('/media/clx123abc'));
  assert.ok(IMAGE_URL.test('https://i.pinimg.com/736x/a/b.jpg'));
  assert.ok(!IMAGE_URL.test('http://example.com/a.jpg'));
  assert.ok(!IMAGE_URL.test('javascript:alert(1)'));
  assert.ok(!IMAGE_URL.test('/media/../admin'));
});
