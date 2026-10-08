import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAi } from '../server/ai-request.mjs';

test('a temporary rejection or network failure retries once with the same request and deadline', async () => {
  for (const status of [429, 500, 502, 503, 504, null]) {
    let calls = 0; const waits = [], options = { body: 'private-input', signal: AbortSignal.timeout(30_000) };
    const result = await fetchAi(async (url, sent) => {
      assert.equal(sent, options); calls++;
      if (calls === 1) { if (!status) throw new TypeError('network'); return new Response(null, { status, headers: { 'Retry-After': '1' } }); }
      return Response.json({ ok: true });
    }, 'https://gateway.test', options, async ms => { waits.push(ms); });
    assert.equal(result.status, 200); assert.equal(calls, 2); assert.deepEqual(waits, [1000]);
  }
});
test('persistent failures are bounded; quota, invalid requests and long Retry-After never retry', async () => {
  for (const [status, body, headers, expected] of [[503, {}, {}, 2], [400, {}, {}, 1], [401, {}, {}, 1], [403, {}, {}, 1], [402, {}, {}, 1], [429, { error: { code: 'insufficient_quota' } }, {}, 1], [429, {}, { 'Retry-After': '60' }, 1], [503, {}, { 'Retry-After': 'invalid' }, 1]]) {
    let calls = 0;
    const result = await fetchAi(async () => { calls++; return Response.json(body, { status, headers }); }, 'https://gateway.test', { signal: AbortSignal.timeout(30_000) }, async () => {});
    assert.equal(result.status, status); assert.equal(calls, expected);
  }
});
test('an expired deadline cannot start a second request or expose network error details', async () => {
  let calls = 0;
  await assert.rejects(fetchAi(async () => { calls++; throw new Error('PRIVATE_NETWORK_DETAILS'); }, 'https://gateway.test', { signal: AbortSignal.abort() }), error => error.status === 503 && !error.message.includes('PRIVATE'));
  assert.equal(calls, 1);
});
