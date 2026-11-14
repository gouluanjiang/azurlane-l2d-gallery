import test from 'node:test';
import assert from 'node:assert/strict';
import releaseCheck from '../desktop/release-check.cjs';
import policy from '../desktop/policy.cjs';

const page = 'https://github.com/gouluanjiang/azurlane-l2d-gallery/releases/tag/v1.7.3';

test('release versions compare numerically and ignore malformed tags', () => {
  assert.equal(releaseCheck.isNewer('v1.7.3', '1.7.2'), true);
  assert.equal(releaseCheck.isNewer('1.10.0', '1.9.9'), true);
  assert.equal(releaseCheck.isNewer('v1.7.2', '1.7.2'), false);
  assert.equal(releaseCheck.isNewer('v1.7.1', '1.7.2'), false);
  for (const tag of ['latest', 'v1.8', 'v1.8.0-beta.1', '', null]) assert.equal(releaseCheck.isNewer(tag, '1.7.2'), false);
});

test('only a published release of this repository becomes a notice', () => {
  assert.deepEqual(releaseCheck.releaseFrom({ tag_name: 'v1.7.3', html_url: page }), { version: '1.7.3', url: page });
  assert.equal(releaseCheck.releaseFrom({ tag_name: 'v1.7.3', html_url: page, draft: true }), null);
  assert.equal(releaseCheck.releaseFrom({ tag_name: 'v1.7.3', html_url: page, prerelease: true }), null);
  for (const html_url of ['https://github.com/someone/else/releases/tag/v1.7.3', 'https://evil.test/gouluanjiang/azurlane-l2d-gallery/releases/tag/v1.7.3', 'http://github.com/gouluanjiang/azurlane-l2d-gallery/releases/tag/v1.7.3', `${page}?x=1`])
    assert.throws(() => releaseCheck.releaseFrom({ tag_name: 'v1.7.3', html_url }));
});

test('the check follows the 自动更新 switch and the 12-hour throttle', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  assert.equal(releaseCheck.checkDue({ autoSync: true }, now), true);
  assert.equal(releaseCheck.checkDue({ autoSync: false }, now), false);
  assert.equal(releaseCheck.checkDue({ autoSync: true, lastReleaseCheck: '2026-11-13T23:00:00Z' }, now), true);
  assert.equal(releaseCheck.checkDue({ autoSync: true, lastReleaseCheck: '2026-11-14T06:00:00Z' }, now), false);
  const stored = { autoSync: true, latestRelease: { version: '1.7.3', url: page } };
  assert.deepEqual(releaseCheck.noticeFrom(stored, '1.7.2'), { version: '1.7.3', url: page });
  assert.equal(releaseCheck.noticeFrom(stored, '1.7.3'), null);
  assert.equal(releaseCheck.noticeFrom({ ...stored, autoSync: false }, '1.7.2'), null);
  assert.equal(releaseCheck.noticeFrom({ autoSync: true, latestRelease: { version: '9.0.0', url: 'https://evil.test/' } }, '1.7.2'), null);
});

test('the release feed is the only address the main process may request', async () => {
  assert.equal(policy.fetchUrl(policy.RELEASE_FEED), 'https://api.github.com/repos/gouluanjiang/azurlane-l2d-gallery/releases/latest');
  for (const url of ['https://api.github.com/repos/gouluanjiang/azurlane-l2d-gallery/releases', 'https://api.github.com/repos/other/repo/releases/latest', 'http://api.github.com/repos/gouluanjiang/azurlane-l2d-gallery/releases/latest'])
    assert.throws(() => policy.fetchUrl(url));
  const calls = [];
  const latest = await releaseCheck.fetchLatestRelease({ userAgent: 'AzurLaneL2DGallery/1.7.2', fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
    return Response.json({ tag_name: 'v1.7.3', html_url: page });
  } });
  assert.deepEqual(calls, [policy.RELEASE_FEED]);
  assert.deepEqual(latest, { version: '1.7.3', url: page });
  await assert.rejects(releaseCheck.fetchLatestRelease({ userAgent: 'x', fetchImpl: async () => new Response('limited', { status: 403 }) }), /HTTP 403/);
});
