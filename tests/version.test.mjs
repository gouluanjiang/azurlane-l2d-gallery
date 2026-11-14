import test from 'node:test';
import assert from 'node:assert/strict';
import { versionSources, versionProblems } from '../scripts/check-version.mjs';

test('every file carrying the program version agrees with package.json', () => {
  assert.deepEqual(versionProblems(versionSources()), []);
});

test('a release tag must name the package.json version', () => {
  const current = { version: '1.7.2', sources: [['package.json', '1.7.2']] };
  assert.deepEqual(versionProblems(current, 'v1.7.2'), []);
  assert.equal(versionProblems(current, 'v1.7.3').length, 1);
  assert.equal(versionProblems(current, '1.7.2').length, 1);
  assert.match(versionProblems({ version: '1.7.2', sources: [['desktop/app.manifest', '1.1.0']] })[0], /app\.manifest 是 1\.1\.0/);
});
