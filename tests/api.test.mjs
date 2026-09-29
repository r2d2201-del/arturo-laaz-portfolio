import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import seed from '../data/catalog.json' with { type: 'json' };
import { createApi } from '../server/api.mjs';
import { hashPassword, createSession, checkSession } from '../server/auth.mjs';
import { youtubeId, moveItem, validateCatalog } from '../lib/catalog.mjs';
import { uploadTicket, inspectUpload } from '../server/cloudinary.mjs';
import { englishField, changeEnglishSource, settleEmptyEnglish, editEnglish, applyEnglish, useAutomaticEnglish, englishMetadata, needsEnglish } from '../lib/english.mjs';

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
    const metadata = new URL(url).searchParams.get('media_metadata') === 'true' ? { duration: 30 } : {};
    return Response.json({ public_id: record.publicId, resource_type: 'video', version: 42, width: 1080, height: 1920, ...metadata });
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

const aiEnv = { OPENAI_API_KEY: 'test-private-ai-key', OPENAI_BASE_URL: 'https://ai-gateway.test/v1' };
function completion(translations) { return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translations }) } }] }); }
test('translation requires authentication and origin, validates inputs and caches successful output', async () => {
  let requests = 0;
  const s = setup({ env: aiEnv, fetcher: async (url, options) => {
    requests++; assert.equal(url, 'https://ai-gateway.test/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-private-ai-key');
    const payload = JSON.parse(options.body); assert.equal(payload.model, 'gpt-4.1-mini'); assert.equal(payload.store, false);
    return completion([{ id: 'title', text: 'Brand launch' }]);
  } });
  const texts = [{ id: 'title', kind: 'title', text: 'Lanzamiento de marca' }];
  assert.equal((await s.call('translate', 'POST', { texts })).status, 401);
  await s.login();
  assert.equal((await s.call('translate', 'POST', { texts }, { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await s.call('translate', 'POST', { texts: [{ id: 'x', kind: 'name', text: 'x'.repeat(81) }] })).status, 400);
  assert.equal((await s.call('translate', 'POST', { texts: [...texts, ...texts] })).status, 400);
  const result = await s.call('translate', 'POST', { texts });
  assert.equal(result.status, 200); assert.equal(result.data.translations[0].text, 'Brand launch');
  assert.ok(!JSON.stringify(result.data).includes(aiEnv.OPENAI_API_KEY));
  assert.deepEqual((await s.call('translate', 'POST', { texts })).data, result.data);
  assert.equal(requests, 1);
  assert.deepEqual((await s.call('translate', 'POST', { texts: [{ id: 'empty', kind: 'description', text: '' }] })).data.translations, [{ id: 'empty', text: '' }]);
});
test('provider failures and malformed translations never become cached successful translations', async () => {
  for (const fetcher of [async () => new Response(null, { status: 429 }), async () => completion([{ id: 'wrong', text: 'Not the requested field' }]), async () => completion([{ id: 'x', text: 'x'.repeat(81) }])]) {
    const s = setup({ env: aiEnv, fetcher }); await s.login();
    assert.ok((await s.call('translate', 'POST', { texts: [{ id: 'x', kind: 'name', text: 'Cine' }] })).status >= 500);
    assert.ok([...s.store.values.keys()].every(x => !x.startsWith('translations/')));
  }
  const s = setup(); await s.login();
  assert.equal((await s.call('translate', 'POST', { texts: [{ id: 'x', kind: 'name', text: 'Cine' }] })).status, 503);
});
test('automatic English ignores stale responses, preserves corrections and can resume automatic updates', () => {
  const field = englishField('Video de marca');
  assert.equal(needsEnglish(field), true);
  changeEnglishSource(field, 'Video de producto');
  assert.equal(applyEnglish(field, 'Video de marca', 'Brand video'), false);
  assert.equal(field.value, '');
  applyEnglish(field, 'Video de producto', 'Product video');
  editEnglish(field, 'Product showcase');
  changeEnglishSource(field, 'Anuncio de producto');
  applyEnglish(field, 'Anuncio de producto', 'Product ad');
  assert.equal(field.value, 'Product showcase');
  const reopened = englishField(field.base, field.value, englishMetadata(field));
  assert.equal(reopened.custom, true); assert.equal(needsEnglish(reopened), false);
  useAutomaticEnglish(reopened); assert.equal(reopened.value, 'Product ad');
  changeEnglishSource(reopened, ''); assert.equal(reopened.value, 'Product ad');
  changeEnglishSource(reopened, 'Anuncio nuevo'); assert.equal(reopened.value, 'Product ad');
  changeEnglishSource(reopened, ''); settleEmptyEnglish(reopened); assert.equal(reopened.value, ''); assert.equal(reopened.custom, false);
  assert.equal(englishField('Original', 'Existing manual translation').custom, true);
});
test('category names and new categories persist as a draft, keep project assignments and publish in both languages', async () => {
  const s = setup(); await s.login();
  const draft = (await s.call('draft')).data.catalog;
  const assignment = draft.items[0].category;
  const category = draft.categories.find(x => x.id === assignment);
  category.name = 'Películas de marca'; category.nameEn = 'Brand films';
  category.english = { name: { source: category.name, automatic: 'Brand films', custom: false } };
  draft.categories.push({ id: 'eventos', name: 'Eventos', nameEn: 'Events' });
  draft.items[1].category = 'eventos';
  draft.items[0].titleEn = 'My correction';
  draft.items[0].english = { title: { source: draft.items[0].title, automatic: 'Automatic title', custom: true } };
  assert.equal((await s.call('draft', 'PUT', { revision: 0, catalog: draft })).status, 200);
  assert.equal((await s.call('catalog')).data.categories.length, 4);
  const saved = (await s.call('draft')).data.catalog;
  assert.equal(saved.items[0].category, assignment); assert.equal(saved.items[0].english.title.custom, true);
  assert.equal(saved.categories.find(x => x.id === assignment).name, 'Películas de marca');
  assert.equal((await s.call('publish', 'POST', { revision: 1 })).status, 200);
  const published = (await s.call('catalog')).data;
  assert.equal(published.categories.length, 5); assert.equal(published.categories.at(-1).nameEn, 'Events');
  assert.ok(published.categories.every(x => !('english' in x))); assert.ok(published.items.every(x => !('english' in x)));
  const invalid = structuredClone(saved); invalid.categories.at(-1).id = 'all';
  assert.equal((await s.call('draft', 'PUT', { revision: 2, catalog: invalid })).status, 400);
});

test('YouTube metrics respect draft/public switches, hidden items and authentication; keys stay private', async () => {
  const requested = [];
  const s = setup({ env: { YOUTUBE_API_KEY: 'private-youtube-key' }, fetcher: async (url, options) => {
    requested.push(url); assert.equal(options.headers['X-Goog-Api-Key'], 'private-youtube-key');
    const ids = new URL(url).searchParams.get('id').split(',');
    return Response.json({ items: ids.map(id => ({ id, statistics: { viewCount: '1500', likeCount: '0' } })) });
  } });
  assert.deepEqual((await s.call('youtube-metrics?ids=aaaaaaaaaaa')).data, { items: [] });
  assert.equal((await s.call('youtube-metrics?preview=draft')).status, 401);
  await s.login();
  const draft = (await s.call('draft')).data.catalog;
  const videos = draft.items.filter(item => item.source.type === 'youtube');
  videos[0].showYoutubeMetrics = true;
  const hidden = videos.find(item => item.source.youtubeId !== videos[0].source.youtubeId);
  hidden.showYoutubeMetrics = true; hidden.visible = false;
  const local = draft.items.find(item => item.source.type === 'video'); local.showYoutubeMetrics = true;
  assert.equal((await s.call('draft', 'PUT', { catalog: draft, revision: 0 })).status, 200);
  assert.equal((await s.call('draft')).data.catalog.items.find(x => x.id === local.id).showYoutubeMetrics, false);
  assert.deepEqual((await s.call('youtube-metrics')).data, { items: [] });
  const preview = await s.call('youtube-metrics?preview=draft');
  assert.equal(preview.status, 200); assert.equal(preview.data.items.length, 1);
  assert.equal(preview.data.items[0].viewCount, '1500'); assert.equal(preview.data.items[0].likeCount, '0'); assert.equal(preview.data.items[0].commentCount, null);
  assert.equal((await s.call('publish', 'POST', { revision: 1 })).status, 200);
  assert.deepEqual((await s.call('youtube-metrics')).data, preview.data); assert.equal(requested.length, 1);
  assert.ok(!JSON.stringify(preview.data).includes('private-youtube-key')); assert.ok(!requested[0].includes('private-youtube-key'));
  assert.ok(!new URL(requested[0]).searchParams.get('id').includes(hidden.source.youtubeId));
  const saved = (await s.call('draft')).data.catalog; saved.items.find(x => x.id === videos[0].id).showYoutubeMetrics = false;
  await s.call('draft', 'PUT', { catalog: saved, revision: 2 }); await s.call('publish', 'POST', { revision: 3 });
  assert.deepEqual((await s.call('youtube-metrics')).data, { items: [] });
});

test('private metrics preview checks a saved video without changing switches or catalog', async () => {
  let calls = 0;
  const id = seed.items.find(item => item.source.type === 'youtube').source.youtubeId;
  const s = setup({ env: { YOUTUBE_API_KEY: 'private-preview-key' }, fetcher: async () => { calls++; return Response.json({ items: [{ id, statistics: { viewCount: '12345', likeCount: '12', commentCount: '3' } }] }); } });
  assert.equal((await s.call('youtube-metrics-preview', 'POST', { id })).status, 401);
  await s.login();
  const before = (await s.call('draft')).data;
  assert.equal((await s.call('youtube-metrics-preview', 'POST', { id }, { headers: { Origin: 'https://attacker.test' } })).status, 403);
  assert.equal((await s.call('youtube-metrics-preview', 'POST', { id: 'invalid' })).status, 400);
  assert.equal((await s.call('youtube-metrics-preview', 'POST', { id: 'aaaaaaaaaaa' })).status, 404);
  const preview = await s.call('youtube-metrics-preview', 'POST', { id });
  assert.equal(preview.status, 200); assert.equal(preview.data.viewCount, '12345'); assert.equal(calls, 1);
  assert.deepEqual((await s.call('draft')).data, before);
  assert.deepEqual((await s.call('youtube-metrics')).data, { items: [] });
  const missing = setup(); await missing.login();
  assert.equal((await missing.call('youtube-metrics-preview', 'POST', { id })).status, 503);
});

test('private library batches draft metrics including hidden projects without publishing or changing the catalog', async () => {
  const requested = [];
  const s = setup({ env: { YOUTUBE_API_KEY: 'private-library-key' }, fetcher: async url => {
    const ids = new URL(url).searchParams.get('id').split(','); requested.push(ids);
    return Response.json({ items: ids.map(id => ({ id, statistics: { viewCount: '12345', likeCount: '0' } })) });
  } });
  assert.equal((await s.call('youtube-metrics-library')).status, 401);
  await s.login();
  const draft = (await s.call('draft')).data.catalog;
  const [visible, hidden, disabled] = draft.items.filter(item => item.source.type === 'youtube');
  visible.showYoutubeMetrics = true;
  hidden.showYoutubeMetrics = true; hidden.visible = false;
  disabled.showYoutubeMetrics = false;
  assert.equal((await s.call('draft', 'PUT', { catalog: draft, revision: 0 })).status, 200);
  const before = (await s.call('draft')).data;
  const library = await s.call('youtube-metrics-library');
  assert.equal(library.status, 200);
  const expectedIds = [visible.source.youtubeId, hidden.source.youtubeId];
  assert.deepEqual(library.data.items.map(item => item.id), expectedIds);
  assert.equal(library.data.items[0].viewCount, '12345');
  assert.equal(library.data.items[0].likeCount, '0');
  assert.equal(library.data.items[0].commentCount, null);
  assert.deepEqual(requested, [expectedIds]);
  assert.deepEqual((await s.call('youtube-metrics-library')).data, library.data);
  assert.equal(requested.length, 1);
  assert.deepEqual((await s.call('youtube-metrics?preview=draft')).data.items.map(item => item.id), [visible.source.youtubeId]);
  assert.deepEqual((await s.call('youtube-metrics')).data, { items: [] });
  assert.deepEqual((await s.call('draft')).data, before);
  assert.ok(!JSON.stringify(library.data).includes('private-library-key'));
});

test('changing an uploaded clip creates a verified variant without altering the published asset or catalog', async () => {
  const requests = [];
  const record = uploadTicket(cloud, 0);
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'POST') return Response.json({ result: 'ok' });
    if (options.method === 'HEAD') return new Response(null, { status: 200 });
    return Response.json({ public_id: record.publicId, resource_type: 'video', version: 42, duration: 20, width: 1920, height: 1080, bytes: 1234 });
  };
  const s = setup({ env: cloud, fetcher });
  assert.equal((await s.call(`uploads/${record.id}/preview`, 'POST', { start: 4 })).status, 401);
  await s.login();
  assert.equal((await s.call(`uploads/${record.id}/preview`, 'POST', { start: 4 })).status, 404);
  await s.store.write(`uploads/${record.id}`, { ...record, size: 1234 });
  assert.equal((await s.call(`uploads/${record.id}/preview`, 'POST', { start: 4 })).status, 409);
  await s.call(`uploads/${record.id}`);
  const old = await s.store.read(`uploads/${record.id}`);
  const before = (await s.call('draft')).data;
  for (const start of [-1, 20, '4', null, 19.99]) assert.equal((await s.call(`uploads/${record.id}/preview`, 'POST', { start })).status, 400);
  assert.equal((await s.call(`uploads/${record.id}/preview`, 'POST', { start: 4 }, { headers: { Origin: 'https://attacker.test' } })).status, 403);
  const same = await s.call(`uploads/${record.id}/preview`, 'POST', { start: 0 });
  assert.equal(same.data.id, record.id);
  const response = await s.call(`uploads/${record.id}/preview`, 'POST', { start: 4.24 });
  assert.equal(response.status, 200); assert.notEqual(response.data.id, record.id);
  const request = requests.find(x => x.options.method === 'POST');
  assert.equal(request.url, 'https://api.cloudinary.com/v1_1/test-cloud/video/explicit');
  assert.equal(request.options.body.get('public_id'), record.publicId);
  assert.match(request.options.body.get('eager'), /so_4.2,du_5/);
  assert.equal(request.options.body.get('eager_async'), 'true');
  assert.equal(request.options.body.has('overwrite'), false);
  const ready = await s.call(`uploads/${response.data.id}`);
  assert.equal(ready.data.status, 'ready'); assert.equal(ready.data.source.assetId, response.data.id);
  assert.equal(ready.data.source.url, old.data.result.source.url);
  assert.match(ready.data.source.preview, /so_4.2,du_5/);
  assert.match(ready.data.source.poster, /so_4.2,f_jpg/);
  assert.deepEqual(await s.store.read(`uploads/${record.id}`), old);
  assert.deepEqual((await s.call('draft')).data, before);
});
