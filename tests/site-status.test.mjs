import test from 'node:test';
import assert from 'node:assert/strict';
import siteStatus from '../desktop/tryout/site-status.cjs';

test('page load errors separate a site outage and a missing network from one model failing', () => {
  for (const error of ['ERR_NAME_NOT_RESOLVED', 'net::ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT', 'ERR_SSL_PROTOCOL_ERROR', 'ERR_EMPTY_RESPONSE'])
    assert.equal(siteStatus.classifyLoadError(error), 'site-down', error);
  assert.equal(siteStatus.classifyLoadError('ERR_INTERNET_DISCONNECTED'), 'offline');
  assert.equal(siteStatus.classifyLoadError('ERR_NAME_NOT_RESOLVED', { online: false }), 'offline');
  // A request the test session blocks, or an aborted load, is not an outage.
  for (const error of ['ERR_BLOCKED_BY_CLIENT', 'ERR_ABORTED', 'ERR_FAILED', '', undefined]) assert.equal(siteStatus.classifyLoadError(error), null);
});

test('a load that never got ready is an outage only when the latest page answer says so', () => {
  assert.equal(siteStatus.classifyAttempt({ mainStatuses: [{ status: 200, atMs: 10 }] }), null);
  assert.equal(siteStatus.classifyAttempt({ mainStatuses: [{ status: 200, atMs: 10 }, { status: 522, atMs: 40000 }] }), 'site-down');
  assert.equal(siteStatus.classifyAttempt({ mainStatuses: [{ status: 503, atMs: 10 }, { status: 200, atMs: 40000 }] }), null);
  assert.equal(siteStatus.classifyAttempt({ mainStatuses: [{ status: 404, atMs: 10 }] }), null, 'a missing skin page is the model, not the site');
  assert.equal(siteStatus.classifyAttempt({ networkErrors: [{ type: 'mainFrame', error: 'net::ERR_CONNECTION_RESET', atMs: 50 }] }), 'site-down');
  assert.equal(siteStatus.classifyAttempt({ networkErrors: [{ type: 'script', error: 'net::ERR_CONNECTION_RESET', atMs: 50 }] }), null, 'one asset failing is the model');
  assert.equal(siteStatus.classifyAttempt({ networkErrors: [{ type: 'mainFrame', error: 'net::ERR_CONNECTION_RESET', atMs: 50 }], mainStatuses: [{ status: 200, atMs: 30000 }] }), null);
  assert.equal(siteStatus.classifyAttempt({}, { online: false }), 'offline');
  assert.equal(siteStatus.classifyAttempt({}), null);
});
