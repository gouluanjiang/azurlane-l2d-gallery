// Tells a whole-site outage of l2d.su apart from one model failing to load, using only what the
// tryout already observed (the page's own load errors and HTTP status). It sends no requests.
//   'offline'   this computer has no network
//   'site-down' l2d.su itself cannot be reached or answers with a server error
//   null        anything else: treat it as this model failing
const OFFLINE_ERRORS = new Set(['ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_CHANGED', 'ERR_NETWORK_IO_SUSPENDED']);
const SITE_DOWN_ERRORS = new Set([
  'ERR_NAME_NOT_RESOLVED', 'ERR_NAME_RESOLUTION_FAILED', 'ERR_ADDRESS_UNREACHABLE', 'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_FAILED', 'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT',
  'ERR_EMPTY_RESPONSE', 'ERR_SSL_PROTOCOL_ERROR', 'ERR_CERT_COMMON_NAME_INVALID', 'ERR_CERT_DATE_INVALID',
  'ERR_CERT_AUTHORITY_INVALID', 'ERR_QUIC_PROTOCOL_ERROR', 'ERR_HTTP2_PROTOCOL_ERROR'
]);
const errorName = value => String(value ?? '').trim().replace(/^net::/, '').toUpperCase();
const serverError = status => Number.isInteger(status) && status >= 500 && status <= 599;

// A main-frame load error (did-fail-load).
function classifyLoadError(error, { online = true } = {}) {
  const name = errorName(error);
  if (!online || OFFLINE_ERRORS.has(name)) return 'offline';
  return SITE_DOWN_ERRORS.has(name) ? 'site-down' : null;
}
// A load that never became ready: the last page answer was a server error, or the page
// request itself failed at the connection level.
function classifyAttempt(attempt = {}, { online = true } = {}) {
  if (!online) return 'offline';
  // Only the latest page answer counts: an early failure followed by a good reload is not an outage.
  const lastStatus = (attempt.mainStatuses || []).at(-1);
  const lastError = (attempt.networkErrors || []).filter(row => row.type === 'mainFrame').at(-1);
  if (lastError && (!lastStatus || lastError.atMs > lastStatus.atMs)) return classifyLoadError(lastError.error, { online });
  return lastStatus && serverError(lastStatus.status) ? 'site-down' : null;
}
const MESSAGES = {
  offline: '电脑似乎没有联网，试玩需要联网',
  'site-down': '在线模型网站 l2d.su 暂时无法访问'
};

module.exports = { classifyLoadError, classifyAttempt, serverError, MESSAGES };
