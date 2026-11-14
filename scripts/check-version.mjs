// Checks that every place carrying the program version agrees with package.json.
//   node scripts/check-version.mjs            files must agree with each other
//   node scripts/check-version.mjs v1.7.3     ...and with this release tag
// CI runs the second form on tag builds, and release:pack runs the first.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

export function versionSources() {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const batch = createRequire(import.meta.url)(path.join(root, 'desktop/tryout/batch.cjs'));
  const full = batch.releaseFrom(batch.fullRelease).version;
  const assembly = text => [...text.matchAll(/Assembly(?:File)?Version\("([^"]+)"\)/g)].map(m => m[1]);
  const manifest = read('desktop/app.manifest').match(/assemblyIdentity\s+version="([^"]+)"/)?.[1];
  const sources = [
    ['package.json', pkg.version],
    ['package-lock.json', lock.version],
    ['package-lock.json packages[""]', lock.packages?.['']?.version],
    ['desktop/tryout/batch.cjs 全部皮肤', full.split('-')[0]],
    ...assembly(read('desktop/Launcher.cs')).map(v => ['desktop/Launcher.cs', v.replace(/\.0$/, '')]),
    ['desktop/app.manifest', manifest?.replace(/\.0$/, '')]
  ];
  return { version: pkg.version, sources };
}

export function versionProblems({ version, sources }, tag) {
  const problems = sources
    .filter(([, v]) => v !== version)
    .map(([file, v]) => `${file} 是 ${v ?? '（缺失）'}，package.json 是 ${version}`);
  if (tag !== undefined && tag !== `v${version}`)
    problems.push(`tag ${tag} 与 package.json 版本 ${version} 不一致（应为 v${version}）`);
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  const result = versionSources();
  const problems = versionProblems(result, tag);
  if (problems.length) {
    for (const problem of problems) console.error(`版本不一致：${problem}`);
    process.exit(1);
  }
  console.log(`版本一致：${result.version}${tag ? `（tag ${tag}）` : ''}`);
}
