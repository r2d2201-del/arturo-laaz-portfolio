import test from 'node:test';
import assert from 'node:assert/strict';
import { aiServiceError } from '../server/ai-errors.mjs';

test('AI errors distinguish quota, throttling, access and integration failures without exposing provider content', async () => {
  for (const [status, provider, code] of [[400, 'invalid_json_schema', 'ai_request_rejected'], [429, 'rate_limit_exceeded', 'ai_rate_limited'], [429, 'insufficient_quota', 'ai_quota_exhausted'], [402, null, 'ai_quota_exhausted'], [401, 'invalid_api_key', 'ai_access_denied'], [503, null, 'ai_unavailable']]) {
    const error = await aiServiceError(Response.json({ error: { code: provider, param: 'response_format', message: 'PRIVATE_PROMPT_AND_KEY' } }, { status }));
    assert.equal(error.code, code);
    assert.equal(error.diagnostic.status, status);
    assert.ok(!JSON.stringify(error).includes('PRIVATE_PROMPT_AND_KEY'));
    assert.ok(!error.message.includes('PRIVATE_PROMPT_AND_KEY'));
    if (code !== 'ai_quota_exhausted') assert.doesNotMatch(error.message, /créditos|consumo/);
  }
  const error = await aiServiceError(Response.json({ error: { code: 'PRIVATE_CODE', type: 'PRIVATE_TYPE', param: 'PRIVATE_PARAM' } }, { status: 500 }));
  assert.deepEqual(error.diagnostic, { status: 500, code: 'unknown', param: null });
  assert.equal((await aiServiceError(new Response('Bad gateway', { status: 502 }))).code, 'ai_unavailable');
});
