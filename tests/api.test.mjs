import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import seed from '../data/catalog.json' with { type: 'json' };
import { createApi } from '../server/api.mjs';
import { hashPassword, createSession, checkSession } from '../server/auth.mjs';
import { youtubeId, moveItem, validateCatalog } from '../lib/catalog.mjs';
import { uploadTicket, inspectUpload } from '../server/cloudinary.mjs';

const password = 'testing-a-long-private-password';
const env = { ADMIN_PASSWORD_HASH: hashPassword(password), SESSION_SECRET: 'secret-for-tests-only-123456789012345678901234567890' };
function memoryStore() {
  const values = new Map();
  return {
    values,
    async read(key) { return structuredClone(values.get(key) || null); },
    async write(key, data, etag = undefined) {
      const old = values.get(key);
      if (etag === null && old || typeof etag === 'string' && old?.etag !== etag) return false;
      values.set(key, { data: structuredClone(data), etag: randomUUID() }); return true;
    },
    async remove(key) { values.delete(key); },
  };
}
function setup(extra = {}) {
  const store = memoryStore(); const api = createApi({ store, env: { ...env, ...extra.env }, fetcher: extra.fetcher });
  let cookie = '';
  async function call(path, method = 'GET', data, options = {}) {
    const headers = { Origin: 'https://portfolio.test', 'X-Portfolio-Request': '1', 'Content-Type': 'application/json', Cookie: cookie, ...options.headers };
    const response = await api(new Request(`https://portfolio.test/api/${path}`, { method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip: '192.0.2.1' });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  return { store, call, login: () => call('login', 'POST', { password }) };
}
test('YouTube URL parsing supports Shorts, embeds and watch links, rejecting lookalike domains', () => {
  for (const url of ['https://youtu.be/nZrfTONeO-o?t=3', 'https://www.youtube.com/shorts/nZrfTONeO-o', 'https://m.youtube.com/watch?v=nZrfTONeO-o&x=1', 'https://youtube.com/embed/nZrfTONeO-o']) assert.equal(youtubeId(url), 'nZrfTONeO-o');
  for (const url of ['https://youtube.com.evil.test/watch?v=nZrfTONeO-o', 'javascript:alert(1)', 'https://youtube.com/watch?v=123', 'https://evil.test/shorts/nZrfTONeO-o']) assert.equal(youtubeId(url), null);
});
test('ordering preserves other projects and accepts moves in both directions', () => {
  const items = ['a', 'b', 'c'].map(id => ({ id }));
  assert.deepEqual(moveItem(items, 'a', 'c').map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(items, 'c', 'a').map(x => x.id), ['c', 'a', 'b']);
  assert.deepEqual(items.map(x => x.id), ['a', 'b', 'c']);
});
test('signed sessions expire and reject tampering or a changed signing secret', () => {
  const now = Date.now(); const token = createSession(env.SESSION_SECRET, now);
  assert.ok(checkSession(token, env.SESSION_SECRET, now));
  assert.equal(checkSession(token + 'x', env.SESSION_SECRET, now), false);
  assert.equal(checkSession(token, 'different-long-secret-1234567890123456789', now), false);
  assert.equal(checkSession(token, env.SESSION_SECRET, now + 8 * 3600_000), false);
});
test('private routes require login; cookie is HttpOnly Secure; logout revokes session', async () => {
  const s = setup(); assert.equal((await s.call('draft')).status, 401);
  const login = await s.login(); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  assert.equal((await s.call('draft')).status, 200);
  assert.equal((await s.call('logout', 'POST', {})).status, 200);
  assert.equal((await s.call('draft', 'GET', undefined, { headers: { Cookie: cookie.split(';')[0] } })).status, 401);
});
test('cross-origin mutations and unconfigured authentication fail closed', async () => {
  const s = setup(); await s.login();
  assert.equal((await s.call('publish', 'POST', { revision: 0 }, { headers: { Origin: 'https://attacker.test' } })).status, 403);
  assert.equal((await setup({ env: { SESSION_SECRET: '' } }).login()).status, 503);
});
test('failed login attempts are rate limited', async () => {
  const s = setup(); for (let i = 0; i < 8; i++) assert.equal((await s.call('login', 'POST', { password: 'wrong-password-123' })).status, 401);
  assert.equal((await s.login()).status, 429);
});
test('draft edits stay private until publish; stale writes are rejected; restoration is a draft', async () => {
  const s = setup(); await s.login(); const original = await s.call('catalog');
  const { data } = await s.call('draft'); const draft = data.catalog;
  draft.items[0].title = '<script>literal text</script>'; draft.items[1].visible = false;
  draft.items = moveItem(draft.items, draft.items[2].id, draft.items[0].id);
  assert.equal((await s.call('draft', 'PUT', { catalog: draft, revision: 0 })).status, 200);
  assert.deepEqual((await s.call('catalog')).data, original.data);
  assert.equal((await s.call('draft', 'PUT', { catalog: draft, revision: 0 })).status, 409);
  assert.equal((await s.call('publish', 'POST', { revision: 0 })).status, 409);
  assert.equal((await s.call('publish', 'POST', { revision: 1 })).status, 200);
  const published = (await s.call('catalog')).data;
  assert.equal(published.items.length, seed.items.length - 1); assert.equal(published.items[0].id, seed.items[2].id);
  assert.ok(published.items.every(x => !('note' in x)));
  const { history } = (await s.call('draft')).data;
  assert.equal((await s.call('restore', 'POST', { revision: 2, id: history[0].id })).status, 200);
  assert.deepEqual((await s.call('catalog')).data, published);
  assert.equal((await s.call('draft')).data.catalog.items[0].title, seed.items[0].title);
});
test('invalid categories, duplicate IDs, hostile URLs and hidden featured videos are rejected', async () => {
  const allowedLocal = new Set([seed.hero.preview, ...seed.items.flatMap(x => [x.source.url, x.source.preview]).filter(Boolean)]);
  for (const mutate of [
    x => { x.items[0].category = 'missing'; },
    x => { x.items[0].id = x.items[1].id; },
    x => { x.items[0].source.preview = 'javascript:alert(1)'; },
    x => { x.items[0].source.preview = 'https://attacker.test/video.mp4'; },
    x => { x.hero.projectId = x.items[0].id; x.items[0].visible = false; },
  ]) { const copy = structuredClone(seed); mutate(copy); assert.throws(() => validateCatalog(copy, { allowedLocal })); }
});
test('YouTube metadata resolves via a fixed host and preserves Shorts orientation', async () => {
  let requested;
  const s = setup({ fetcher: async url => { requested = url; return Response.json({ title: 'Mi Short' }); } }); await s.login();
  const result = await s.call('youtube', 'POST', { url: 'https://youtube.com/shorts/nZrfTONeO-o' });
  assert.equal(result.status, 200); assert.equal(result.data.aspect, 'portrait'); assert.equal(result.data.title, 'Mi Short'); assert.match(result.data.poster, /^https:\/\/i.ytimg.com/); assert.match(requested, /^https:\/\/www.youtube.com\/oembed\?/);
  assert.equal((await s.call('youtube', 'POST', { url: 'http://127.0.0.1/secret' })).status, 400);
});
const cloud = { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' };
test('upload authorization requires login, configured service and allowed file size', async () => {
  const s = setup(); await s.login(); assert.equal((await s.call('upload-sign', 'POST', { size: 100, name: 'a.mp4' })).status, 503);
  const ready = setup({ env: cloud }); await ready.login();
  assert.equal((await ready.call('upload-sign', 'POST', { size: 200 * 1024 ** 2, name: 'a.mp4' })).status, 400);
  assert.equal((await ready.call('upload-sign', 'POST', { size: 100, name: 'a.exe' })).status, 400);
  const response = await ready.call('upload-sign', 'POST', { size: 100, name: 'a.mov', start: 2 });
  assert.equal(response.status, 200); assert.match(response.data.fields.eager, /so_2,du_5/); assert.equal(response.data.fields.overwrite, 'false'); assert.equal(JSON.stringify(response.data).includes(cloud.CLOUDINARY_API_SECRET), false);
});
test('video readiness checks all three outputs and respects original aspect ratio', async () => {
  const record = uploadTicket(cloud, 1); let heads = 0;
  const fetcher = async (url, options) => {
    if (options.method === 'HEAD') { heads++; return new Response(null, { status: 200 }); }
    return Response.json({ public_id: record.publicId, resource_type: 'video', version: 42, duration: 30, width: 1080, height: 1920 });
  };
  const result = await inspectUpload(record, cloud, fetcher);
  assert.equal(result.status, 'ready'); assert.equal(result.aspect, 'portrait'); assert.equal(heads, 3); assert.match(result.source.preview, /ac_none,so_1,du_5/); assert.match(result.source.url, /c_limit,w_1920,h_1920/);
  const pending = await inspectUpload(record, cloud, async (url, options) => options.method === 'HEAD' ? new Response(null, { status: 423 }) : fetcher(url, options));
  assert.equal(pending.status, 'processing');
});
test('publication cannot use fabricated Cloudinary media or unfinished uploads', async () => {
  const s = setup({ env: cloud }); await s.login(); const copy = structuredClone(seed);
  copy.items[0].source = { type: 'video', youtubeId: '', assetId: randomUUID(), url: 'https://res.cloudinary.com/test-cloud/video/upload/fake.mp4', preview: 'https://res.cloudinary.com/test-cloud/video/upload/fake.mp4', poster: '' };
  assert.equal((await s.call('draft', 'PUT', { revision: 0, catalog: copy })).status, 409);
  copy.items[0].source.assetId = '';
  assert.equal((await s.call('draft', 'PUT', { revision: 0, catalog: copy })).status, 400);
});
