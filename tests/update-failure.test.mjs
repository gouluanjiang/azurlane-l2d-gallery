import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scenarios = [
  { name: 'unknown WIKI JSON schema', error: /关键字段格式未知/, mutate: `
    const slot = pages[2].response.query.pages[0].revisions[0].slots.main;
    const records = JSON.parse(slot.content);
    records[0]['新类型字段'] = records[0]['立绘类型'];
    delete records[0]['立绘类型'];
    slot.content = JSON.stringify(records);
  ` },
  { name: 'unknown WIKI loader beside stale templates', error: /加载器格式未知/, mutate: `
    const slot = pages[0].response.query.pages[0].revisions[0].slots.main;
    const legacy = fixture('wiki-pages.json')[0].response.query.pages[0].revisions[0].slots.main.content;
    slot.content = slot.content.replace('ClothListPage.js', 'FutureClothList.js') + legacy;
  ` },
];

for (const scenario of scenarios) test(`update CLI exits nonzero and preserves published files on ${scenario.name}`, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'l2d-wiki-failure-'));
  try {
    mkdirSync(path.join(root, 'data'));
    const before = new Map(['catalog.json', 'skins-data.js', 'review.json', 'update-report.json'].map(name => {
      const bytes = readFileSync(new URL(`../data/${name}`, import.meta.url));
      writeFileSync(path.join(root, 'data', name), bytes);
      return [name, bytes];
    }));
    // Run the real CLI with offline HTTP responses. An unknown source format
    // must reach the failure handler, not publish an all-clear.
    const fixturesUrl = new URL('./fixtures/sources/', import.meta.url).href;
    const scriptUrl = new URL('../scripts/check-updates.mjs', import.meta.url).href;
    const code = `
      import { readFileSync } from 'node:fs';
      const fixture = name => JSON.parse(readFileSync(new URL(name, ${JSON.stringify(fixturesUrl)}), 'utf8'));
      const pages = fixture('wiki-cloth-list-2026-09-30.json');
      ${scenario.mutate}
      globalThis.fetch = async input => {
        const url = new URL(input);
        let data;
        if (url.hostname === 'api.biligame.com' && url.pathname === '/news/list') {
          data = fixture(url.searchParams.get('pageNum') === '2' ? 'official-list-page2.json' : 'official-list.json');
        } else {
          data = pages.find(page => page.requestedTitle === url.searchParams.get('titles'))?.response;
        }
        if (!data) throw new Error('Unexpected test request: ' + url);
        return { ok: true, status: 200, json: async () => data };
      };
      await import(${JSON.stringify(scriptUrl)});
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
      env: { ...process.env, L2D_DATA_ROOT: root }, encoding: 'utf8', timeout: 15000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, scenario.error);
    for (const [name, bytes] of before) assert.deepEqual(readFileSync(path.join(root, 'data', name)), bytes, name);
    const failure = JSON.parse(readFileSync(path.join(root, 'data/update-attempt.json'), 'utf8'));
    assert.equal(failure.status, 'failed');
    assert.match(failure.error, scenario.error);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
