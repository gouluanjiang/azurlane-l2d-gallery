import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import thumbs from '../desktop/thumbs.cjs';
import policy from '../desktop/policy.cjs';

test('thumbnail requests map only to artwork files', () => {
  assert.equal(thumbs.thumbSource('thumbs/assets/skins/060.jpg'), 'assets/skins/060.jpg');
  for (const value of ['assets/skins/060.jpg', 'thumbs/data/skins-data.js', 'thumbs/assets/skins/../x.jpg', 'thumbs/assets/skins/a/b.jpg', 'thumbs/assets/skins/code.js', 'thumbs/assets/guides/a.png', null])
    assert.equal(thumbs.thumbSource(value), null);
  assert.equal(policy.thumbnailSource('l2d://gallery/thumbs/assets/skins/060.jpg'), 'assets/skins/060.jpg');
  assert.equal(policy.thumbnailSource('l2d://gallery/assets/skins/060.jpg'), null);
  assert.equal(policy.thumbnailSource('l2d://other/thumbs/assets/skins/060.jpg'), null);
  assert.equal(policy.thumbnailSource('https://gallery/thumbs/assets/skins/060.jpg'), null);
});

test('thumbnails are made once, cached in .desktop-data and refreshed when the artwork changes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2d-thumbs-'));
  try {
    const source = path.join(root, 'assets/skins/060.jpg');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'original');
    let calls = 0;
    const cache = new thumbs.ThumbCache(root, { resize: async (file, width) => { calls++; assert.equal(file, source); assert.equal(width, thumbs.THUMB_WIDTH); return Buffer.from('small'); } });
    const [first, again] = await Promise.all([cache.fileFor(source, 'assets/skins/060.jpg'), cache.fileFor(source, 'assets/skins/060.jpg')]);
    assert.equal(first, again);
    assert.equal(calls, 1);
    assert.ok(first.startsWith(path.join(root, '.desktop-data', 'thumbs') + path.sep));
    assert.equal(fs.readFileSync(first, 'utf8'), 'small');
    assert.equal(await cache.fileFor(source, 'assets/skins/060.jpg'), first);
    assert.equal(calls, 1);
    fs.writeFileSync(source, 'a new, longer original');
    const next = await cache.fileFor(source, 'assets/skins/060.jpg');
    assert.notEqual(next, first);
    assert.equal(calls, 2);
    assert.deepEqual(fs.readdirSync(path.join(root, '.desktop-data/thumbs')), [path.basename(next)]);
    // A failed or empty resize falls back to the original file instead of breaking the card.
    const broken = new thumbs.ThumbCache(path.join(root, 'other'), { resize: async () => { throw new Error('decode failed'); } });
    assert.equal(await broken.fileFor(source, 'assets/skins/060.jpg'), source);
    const empty = new thumbs.ThumbCache(path.join(root, 'empty'), { resize: async () => null });
    assert.equal(await empty.fileFor(source, 'assets/skins/060.jpg'), source);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
