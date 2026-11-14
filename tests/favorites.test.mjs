import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import favorites from '../desktop/favorites.cjs';

test('favorites are stored per computer in .desktop-data and survive bad files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2d-favorites-'));
  try {
    const store = new favorites.FavoritesStore(root);
    assert.deepEqual(store.list(), []);
    assert.deepEqual(store.set('azl-e6548902747dbc36', true), ['azl-e6548902747dbc36']);
    assert.deepEqual(store.set('azl-a17232397b1db5bb', true), ['azl-e6548902747dbc36', 'azl-a17232397b1db5bb']);
    assert.deepEqual(store.set('azl-e6548902747dbc36', true), ['azl-a17232397b1db5bb', 'azl-e6548902747dbc36']);
    assert.deepEqual(store.set('azl-a17232397b1db5bb', false), ['azl-e6548902747dbc36']);
    assert.deepEqual(new favorites.FavoritesStore(root).list(), ['azl-e6548902747dbc36']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.desktop-data/favorites.json'), 'utf8')).schemaVersion, 1);
    for (const [id, on] of [['../x', true], ['', true], [42, true], ['azl-1', 'yes']]) assert.throws(() => store.set(id, on));
    fs.writeFileSync(path.join(root, '.desktop-data/favorites.json'), '{broken');
    assert.deepEqual(store.list(), []);
    fs.writeFileSync(path.join(root, '.desktop-data/favorites.json'), JSON.stringify({ ids: ['ok-1', '../bad', 'ok-1', 7] }));
    assert.deepEqual(store.list(), ['ok-1']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
