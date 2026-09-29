import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { youtubeMetrics } from '../server/youtube-metrics.mjs';
import { metricsText } from '../lib/youtube-metrics-view.mjs';
const env = { YOUTUBE_API_KEY: 'test-youtube-key' };
const hour = 3_600_000;
const start = Date.parse('2026-09-28T10:00:00Z');
const catalog = { items: ['aaaaaaaaaaa', 'bbbbbbbbbbb'].map(youtubeId => ({ visible: true, showYoutubeMetrics: true, source: { type: 'youtube', youtubeId } })) };
function memory() {
  let record = null;
  return {
    async read() { return structuredClone(record); },
    async write(key, data, etag) { if (etag === null && record || typeof etag === 'string' && record?.etag !== etag) return false; record = { data: structuredClone(data), etag: randomUUID() }; return true; },
  };
}
test('metrics cache refreshes hourly; failures back off and never manufacture zeros or display day-old counts', async () => {
  const store = memory(); let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ items: [{ id: 'aaaaaaaaaaa', statistics: { viewCount: '1234', likeCount: '0', commentCount: '3' } }] }); };
  const first = await youtubeMetrics(catalog, { store, env, fetcher, now: start });
  assert.equal(first.items[0].viewCount, '1234'); assert.equal(first.items[1].status, 'unavailable');
  await youtubeMetrics(catalog, { store, env, fetcher, now: start + hour - 1 }); assert.equal(calls, 1);
  const failing = async () => { calls++; return new Response(null, { status: 403 }); };
  const stale = await youtubeMetrics(catalog, { store, env, fetcher: failing, now: start + hour });
  assert.equal(stale.items[0].stale, true); assert.equal(stale.items[0].viewCount, '1234'); assert.equal(calls, 2);
  await youtubeMetrics(catalog, { store, env, fetcher: failing, now: start + hour + 1000 }); assert.equal(calls, 2);
  const expired = await youtubeMetrics(catalog, { store, env, fetcher: failing, now: start + 25 * hour });
  assert.equal(expired.items[0].status, 'error'); assert.equal(expired.items[0].viewCount, undefined);
  const unconfigured = await youtubeMetrics(catalog, { store, env: {}, fetcher, now: start });
  assert.equal(unconfigured.items[0].status, 'unconfigured'); assert.equal(unconfigured.items[0].viewCount, undefined);
});
test('metrics lease prevents concurrent quota consumption; batches have at most 50 IDs', async () => {
  const store = memory(); let calls = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const fetcher = async url => { calls++; assert.ok(new URL(url).searchParams.get('id').split(',').length <= 50); await wait; return Response.json({ items: [] }); };
  const large = { items: Array.from({ length: 51 }, (_, n) => ({ ...catalog.items[0], source: { type: 'youtube', youtubeId: String(n).padStart(11, 'a') } })) };
  const first = youtubeMetrics(large, { store, env, fetcher, now: start });
  await new Promise(resolve => setImmediate(resolve));
  const second = await youtubeMetrics(large, { store, env, fetcher, now: start });
  assert.equal(calls, 2); assert.equal(second.items[0].status, 'error');
  release(); await first;
  await youtubeMetrics(large, { store, env, fetcher, now: start + 1000 }); assert.equal(calls, 2);
});
test('metrics labels localize, distinguish zero from missing and preserve large exact counts', () => {
  const data = { status: 'available', viewCount: '18446744073709551615', likeCount: '0', commentCount: null, updatedAt: new Date(start).toISOString() };
  const es = metricsText(data, 'es'), en = metricsText(data, 'en');
  assert.equal(es.values[0].label, 'Visualizaciones'); assert.equal(en.values[0].label, 'Views');
  assert.equal(es.values[1].value, '0'); assert.equal(es.values[2].value, '—'); assert.equal(es.values[2].full, 'No disponible');
  assert.equal(en.values[0].full, '18,446,744,073,709,551,615'); assert.match(en.status, /Updated/);
  assert.match(metricsText({ ...data, stale: true }, 'en').status, /Last available data/);
});
