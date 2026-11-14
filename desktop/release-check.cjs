// Tells the gallery that a newer release of the program exists. It only reminds: the
// user downloads the new portable package from the release page themselves.
// The check runs with the automatic catalog sync (设置 → 自动更新), at most every 12 hours,
// and the last answer is kept in .desktop-data/auto-update.json so the notice survives restarts.
const { RELEASE_FEED, fetchUrl, releasePage } = require('./policy.cjs');

const CHECK_INTERVAL = 12 * 3600000;

function parseVersion(value) {
  const match = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(value ?? '').trim());
  return match ? match.slice(1).map(Number) : null;
}
function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
// GitHub's /releases/latest already skips drafts and prereleases; check again anyway.
function releaseFrom(json) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const version = parseVersion(json.tag_name);
  if (!version) return null;
  return { version: version.join('.'), url: releasePage(json.html_url) };
}
const checkDue = (settings, now = Date.now()) => settings.autoSync !== false && !(Date.parse(settings.lastReleaseCheck || '') > now - CHECK_INTERVAL);
async function fetchLatestRelease({ fetchImpl, userAgent, timeoutMs = 15000 }) {
  const response = await fetchImpl(fetchUrl(RELEASE_FEED), {
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent, 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!response.ok) throw new Error(`查询新版本失败：HTTP ${response.status}`);
  return releaseFrom(await response.json());
}
// The notice shown in the top bar: only while automatic updates are on and the stored
// release is newer than the running program.
function noticeFrom(settings, currentVersion) {
  const latest = settings.latestRelease;
  if (settings.autoSync === false || !latest || !isNewer(latest.version, currentVersion)) return null;
  try { return { version: latest.version, url: releasePage(latest.url) }; } catch { return null; }
}

module.exports = { CHECK_INTERVAL, parseVersion, isNewer, releaseFrom, checkDue, fetchLatestRelease, noticeFrom };
