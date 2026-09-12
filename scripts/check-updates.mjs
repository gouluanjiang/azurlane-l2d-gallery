import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUpdates } from './lib/sources.mjs';
import { validateCatalog, serializeCatalog, isValidDate } from './lib/catalog.mjs';
import { fetchImage, sha256 } from './lib/transport.mjs';
import { atomicWrite, jsonText, readJson, safePath, syncCatalog, checkCompatibility } from './lib/sync-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dataFile = path.join(root,'data/catalog.json'), reportFile = path.join(root,'data/update-report.json');
let result;
try {
  const before = fs.readFileSync(dataFile), current = readJson(dataFile); validateCatalog(current);
  const reviewFile = path.join(root,'data/review.json');
  const previousReview = fs.existsSync(reviewFile) ? readJson(reviewFile).items || [] : [];
  const pendingDates = previousReview.map(item => item.releaseDate || item.date).filter(isValidDate).sort();
  const since = pendingDates.length && pendingDates[0] < current.updatedTo ? pendingDates[0] : undefined;
  console.log('读取官方维护公告正文，并核对 Wiki 身份、原图和类型……');
  result = await getUpdates(current, { since });
  const report = { status: result.review.length ? 'review_required' : 'success', ...result.report };
  if (args.has('--check-only')) {
    atomicWrite(path.join(root,'verification/detection-report.json'),jsonText({ ...report, candidates: result.candidates, review:result.review }));
    console.log(jsonText({ mode:'read-only',newSkins:result.candidates.map(s=>({character:s.character,name:s.name,type:s.type,releaseDate:s.releaseDate})),review:result.review }));
  } else {
    const next = structuredClone(current);
    for (const candidate of result.candidates) {
      console.log(`校验新原图：${candidate.character}「${candidate.name}」`);
      const image = await fetchImage(candidate.artworkSource);
      const record = { ...candidate, artworkSha256:image.sha256,artworkBytes:image.size };
      const expected = path.extname(record.artworkPath).slice(1).replace('jpeg','jpg');
      if (expected !== image.format) throw new Error(`来源图片格式不一致：${record.name}`);
      const destination = safePath(root, `.l2d-update/cloud-images/${record.id}.${image.format}`);
      atomicWrite(destination,image.bytes);
      next.skins.push(record);
    }
    next.updatedTo = next.skins.map(s=>s.releaseDate).sort().at(-1);
    next.checkedAt = report.checkedAt;
    next.reviewCount = result.review.length;
    next.version = `${report.checkedAt.replace(/[-:.]/g,'')}-${sha256(JSON.stringify(next.skins)).slice(0,12)}`;
    validateCatalog(next); checkCompatibility(current,next);
    if (sha256(fs.readFileSync(dataFile)) !== sha256(before)) throw new Error('检查期间目录数据发生变化，停止发布，请重试');
    if (args.has('--apply-local')) {
      await syncCatalog({rootDir:root,nextCatalog:next,progress:console.log});
    } else {
      // GitHub publishes both files in one Git commit only after every source and
      // new original passed validation. Local app reads the JS mirror offline.
      atomicWrite(path.join(root,'data/skins-data.js'),serializeCatalog(next));
      atomicWrite(dataFile,jsonText(next));
    }
    atomicWrite(reviewFile,jsonText({ checkedAt:report.checkedAt,items:result.review }));
    atomicWrite(reportFile,jsonText(report));
    console.log(jsonText({ status:report.status,added:result.candidates.length,count:next.skins.length,updatedTo:next.updatedTo,review:result.review.length }));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## 图鉴更新\n\n检查时间：${report.checkedAt}\n\n新增 ${result.candidates.length} 款；共 ${next.skins.length} 款；资料至 ${next.updatedTo}；待核对 ${result.review.length} 项。\n\n${result.candidates.map(s=>`- ${s.character}：${s.name} (${s.type}, ${s.releaseDate})`).join('\n')}\n`);
  }
} catch(error) {
  const failure={status:'failed',attemptedAt:new Date().toISOString(),error:error.message,partialReport:result?.report};
  atomicWrite(path.join(root,'data/update-attempt.json'),jsonText(failure));
  console.error(`本次检查失败，没有发布成功更新：${error.message}`);process.exitCode=1;
}
