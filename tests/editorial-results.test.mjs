import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import seed from '../data/catalog.json' with { type: 'json' };
import { createApi } from '../server/api.mjs';
import { hashPassword } from '../server/auth.mjs';
import { suggestionSession } from '../lib/editorial.mjs';
import { publicCatalog, validateCatalog } from '../lib/catalog.mjs';
import { batchEvidence, validateReports } from '../lib/client-results.mjs';

const report = { id: 'example-report', client: 'Example client', attribution: 'Client team', date: '2026-09-30', enabled: true, qualifiedLeadPercent: 77, privateSource: 'PRIVATE_SLACK_SOURCE', batches: [
  { code: 'B115', name: 'Three reasons', highlighted: true, leadLeader: true, views: 1000000 },
  { code: 'B68', name: 'Choose your path', highlighted: true, leadLeader: true, views: null },
] };
const input = { brief: { subject: 'Correas de reloj', contribution: 'Montaje y subtítulos', approach: 'Presentación a cámara', objective: 'Mostrar la colección' }, currentTitle: 'Alto CTR', currentDescription: 'Mejor rendimiento', privateSource: 'MUST_NOT_BE_SENT' };
const output = { options: [
  { title: 'Correas de reloj · UGC', description: 'Montaje y subtítulos para una presentación de correas a cámara.', reason: 'Identifica el producto y el formato.' },
  { title: 'Una colección de correas', description: 'Presentación a cámara con montaje y subtítulos.', reason: 'Destaca el concepto sin añadir resultados.' },
  { title: 'Montaje UGC para correas', description: 'Edición y subtítulos para presentar una colección de correas de reloj.', reason: 'Hace explícita la aportación.' },
], recommended: 0, missingInfo: [] };
const ai = { OPENAI_API_KEY: 'private-test-key', OPENAI_BASE_URL: 'https://gateway.test/v1' };
function setup(fetcher, aiConfigured = true) {
  const values = new Map(); let cookie = '';
  const store = {
    read: async key => structuredClone(values.get(key) || null),
    write: async (key, data, etag) => { const old = values.get(key); if (etag === null && old || typeof etag === 'string' && old?.etag !== etag) return false; values.set(key, { data: structuredClone(data), etag: randomUUID() }); return true; },
    remove: async key => values.delete(key),
  };
  const handler = createApi({ store, env: { ADMIN_PASSWORD_HASH: hashPassword('private-long-test-password'), SESSION_SECRET: 'a'.repeat(48), ...(aiConfigured ? ai : {}) }, fetcher });
  const call = async (path, method = 'GET', body, origin = 'https://portfolio.test') => {
    const response = await handler(new Request(`https://portfolio.test/api/${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'X-Portfolio-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  return { values, call, login: () => call('login', 'POST', { password: 'private-long-test-password' }) };
}
const response = data => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });

test('editorial suggestions are authenticated, origin protected, constrained and cached without sending private fields', async () => {
  let requests = 0;
  const s = setup(async (url, options) => {
    requests++; assert.equal(url, 'https://gateway.test/v1/chat/completions');
    const payload = JSON.parse(options.body); assert.equal(payload.store, false);
    const content = JSON.parse(payload.messages[1].content);
    assert.deepEqual(Object.keys(content).sort(), ['brief', 'currentDescription', 'currentTitle']);
    assert.ok(!options.body.includes('MUST_NOT_BE_SENT'));
    return response(output);
  });
  assert.equal((await s.call('editorial-suggestions', 'POST', input)).status, 401);
  await s.login(); const before = (await s.call('draft')).data;
  assert.equal((await s.call('editorial-suggestions', 'POST', input, 'https://evil.test')).status, 403);
  assert.equal((await s.call('editorial-suggestions', 'POST', { brief: {} })).status, 400);
  assert.equal((await s.call('editorial-suggestions', 'POST', { ...input, brief: { ...input.brief, approach: 'x'.repeat(601) } })).status, 400);
  const result = await s.call('editorial-suggestions', 'POST', input);
  assert.equal(result.status, 200); assert.deepEqual(result.data, output);
  assert.deepEqual((await s.call('editorial-suggestions', 'POST', input)).data, output); assert.equal(requests, 1);
  assert.deepEqual((await s.call('draft')).data, before);
  assert.ok(!JSON.stringify(result).includes(ai.OPENAI_API_KEY));
});
test('unavailable AI, rate limits, malformed replies and performance claims do not become suggestions', async () => {
  const s = setup(null, false); await s.login();
  assert.equal((await s.call('editorial-suggestions', 'POST', input)).status, 503);
  for (const mutate of [r => r.options.pop(), r => r.recommended = 4, r => r.options[0].title = 'Alto CTR garantizado', r => r.options[0].description = '77% de anuncios activos', r => r.options[0].title = '<script>alert(1)</script>', r => r.options[0].reason = '', r => r.missingInfo = null]) {
    const invalid = structuredClone(output); mutate(invalid);
    const s = setup(async () => response(invalid)); await s.login();
    assert.equal((await s.call('editorial-suggestions', 'POST', input)).status, 502);
    assert.ok([...s.values.keys()].every(k => !k.startsWith('editorial/v1/')));
  }
  const limited = setup(async () => { throw new Error('must not call'); }); await limited.login();
  limited.values.set(`editorial-usage/${Math.floor(Date.now() / 3600000)}`, { data: { count: 40 }, etag: 'limit' });
  assert.equal((await limited.call('editorial-suggestions', 'POST', input)).status, 429);
});
test('invalid editorial output is regenerated once from confirmed input without caching or reusing the invalid claim', async () => {
  for (const badTitle of ['Alto CTR garantizado', 'x'.repeat(71)]) {
    let requests = 0, originalSignal;
    const invalid = structuredClone(output); invalid.options[0].title = badTitle;
    const s = setup(async (_url, options) => {
      requests++;
      const payload = JSON.parse(options.body);
      if (requests === 1) originalSignal = options.signal;
      else {
        assert.equal(options.signal, originalSignal);
        assert.match(payload.messages[0].content, /respuesta anterior falló/);
        assert.ok(!payload.messages[0].content.includes(badTitle));
        assert.ok([...s.values.keys()].every(k => !k.startsWith('editorial/v1/')));
      }
      assert.deepEqual(JSON.parse(payload.messages[1].content).brief, input.brief);
      return response(requests === 1 ? invalid : output);
    });
    await s.login();
    assert.deepEqual((await s.call('editorial-suggestions', 'POST', input)).data, output);
    assert.equal(requests, 2);
    assert.deepEqual((await s.call('editorial-suggestions', 'POST', input)).data, output);
    assert.equal(requests, 2);
  }
  let requests = 0;
  const bad = structuredClone(output); bad.options[0].description = 'x'.repeat(181);
  const persistent = setup(async () => { requests++; return response(bad); });
  await persistent.login();
  const result = await persistent.call('editorial-suggestions', 'POST', input);
  assert.equal(result.status, 502); assert.equal(requests, 2);
  assert.equal(result.data.code, 'ai_invalid_output');
  assert.deepEqual(result.data.diagnostic, { reason: 'description_text_or_length' });
  assert.ok([...persistent.values.keys()].every(k => !k.startsWith('editorial/v1/')));
});
test('stale suggestions cannot overwrite edits, cross dialogs or be applied twice', async () => {
  let state = structuredClone(input), applied = [];
  const session = suggestionSession(() => state, option => { applied.push(option); });
  let resolve;
  const pending = session.generate(() => new Promise(r => resolve = r));
  state.currentTitle = 'Manual edit'; resolve(output); assert.equal(await pending, false); assert.equal(session.use(0), false);
  await session.generate(async () => output); state.brief.subject = 'Another product'; assert.equal(session.use(0), false);
  await session.generate(async () => output); assert.equal(session.use(1), true); assert.equal(session.use(0), false); assert.equal(applied.length, 1);
  const closing = session.generate(() => new Promise(r => resolve = r)); session.dispose(); resolve(output);
  assert.equal(await closing, false); assert.equal(session.use(0), false);
});
test('client reports survive draft/publication/restore; private evidence and briefs never become public', async () => {
  const s = setup(); await s.login();
  const draft = (await s.call('draft')).data.catalog;
  draft.reports = [structuredClone(report)];
  draft.items[0].batch = { reportId: report.id, code: 'B115' };
  draft.items[0].editorial = { subject: 'PRIVATE_BRIEF', contribution: 'Editing' };
  draft.items[1].batch = { reportId: report.id, code: 'B68' }; draft.items[1].visible = false;
  assert.equal((await s.call('draft', 'PUT', { revision: 0, catalog: draft })).status, 200);
  assert.equal((await s.call('catalog')).data.reports.length, 0);
  assert.equal((await s.call('draft')).data.catalog.reports[0].privateSource, 'PRIVATE_SLACK_SOURCE');
  assert.equal((await s.call('publish', 'POST', { revision: 1 })).status, 200);
  const published = (await s.call('catalog')).data;
  assert.equal(published.reports[0].batches.length, 1); assert.equal(published.reports[0].batches[0].code, 'B115');
  assert.ok(!JSON.stringify(published).includes('PRIVATE_')); assert.ok(!JSON.stringify(published).includes('privateSource'));
  const saved = (await s.call('draft')).data;
  await s.call('restore', 'POST', { revision: 2, id: saved.history[0].id });
  assert.deepEqual((await s.call('catalog')).data, published);
  assert.equal((await s.call('draft')).data.catalog.reports.length, 0);
});
test('report validation prevents dangling batches, invalid dates, duplicate codes and misleading numeric defaults', () => {
  for (const mutate of [r => r.date = '', r => r.date = '2026-02-30', r => r.qualifiedLeadPercent = 101, r => r.qualifiedLeadPercent = '77', r => r.batches[0].views = -1, r => r.batches.push(r.batches[0])]) {
    const r = structuredClone(report); mutate(r); assert.throws(() => validateReports([r]));
  }
  const catalog = structuredClone(seed); catalog.reports = [report]; catalog.items[0].batch = { reportId: report.id, code: 'MISSING' };
  const allowedLocal = new Set([seed.hero.preview, ...seed.items.flatMap(i => [i.source.url, i.source.preview]).filter(Boolean)]);
  assert.throws(() => validateCatalog(catalog, { allowedLocal }));
  catalog.items[0].batch.code = 'B115';
  const evidence = batchEvidence(catalog, catalog.items[0]);
  assert.match(evidence.aggregate, /77% de los anuncios activos/); assert.match(evidence.scope, /sin desglose por versión/);
  assert.match(evidence.views, /1[.,]000[.,]000/); assert.ok(!evidence.views.includes('+'));
  const english = batchEvidence(catalog, catalog.items[0], 'en'); assert.match(english.scope, /no breakdown/); assert.match(english.attribution, /Sep/);
  const none = structuredClone(catalog); none.reports[0].enabled = false;
  assert.equal(batchEvidence(none, none.items[0]), null); assert.equal(publicCatalog(none).items[0].batch, null);
  const zero = structuredClone(catalog); zero.reports[0].qualifiedLeadPercent = 0; zero.reports[0].batches[0].views = 0;
  assert.match(batchEvidence(zero, zero.items[0]).views, /^0 /); assert.match(batchEvidence(zero, zero.items[0]).aggregate, /el 0%/);
});

const review = { id: 'review-test', kind: 'review', client: 'Client on Upwork', attribution: 'Client on Upwork', date: '2025-07-02', dateKind: 'contract-end', enabled: true, batches: [], platform: 'upwork', sourceAccess: 'public', sourceUrl: 'https://www.upwork.com/freelancers/example', privateSource: 'PRIVATE_REVIEW_NOTE', quote: 'Real client feedback.', quoteEs: 'Comentario real del cliente.', language: 'en', context: 'Editing contract', rating: 5, scope: 'collaboration', featured: true, projectIds: [] };
test('real reviews survive draft/publish/restore with source, scope and original text; private notes stay private', async () => {
  const s = setup(); await s.login(); const before = (await s.call('draft')).data;
  before.catalog.reports = [structuredClone(report), structuredClone(review)];
  before.catalog.reports[1].projectIds = [before.catalog.items[0].id];
  before.catalog.items[0].batch = { reportId: report.id, code: 'B115' };
  assert.equal((await s.call('draft', 'PUT', { revision: 0, catalog: before.catalog })).status, 200);
  assert.equal((await s.call('catalog')).data.reports.length, 0);
  assert.equal((await s.call('publish', 'POST', { revision: 1 })).status, 200);
  const published = (await s.call('catalog')).data;
  const r = published.reports.find(r => r.kind === 'review');
  assert.equal(r.quote, review.quote); assert.equal(r.quoteEs, review.quoteEs); assert.equal(r.rating, 5); assert.equal(r.dateKind, 'contract-end');
  assert.equal(r.scope, 'collaboration'); assert.equal(r.sourceUrl, review.sourceUrl); assert.ok(!JSON.stringify(published).includes('PRIVATE_'));
  const saved = (await s.call('draft')).data;
  assert.equal(saved.catalog.reports[1].privateSource, 'PRIVATE_REVIEW_NOTE');
  assert.equal((await s.call('draft', 'PUT', { revision: 1, catalog: before.catalog })).status, 409);
  await s.call('restore', 'POST', { revision: saved.revision, id: saved.history[0].id });
  assert.deepEqual((await s.call('catalog')).data, published);
});
test('review validation rejects invented defaults, unsafe public sources and dangling project associations', () => {
  for (const mutate of [r => r.rating = '5', r => r.rating = 6, r => r.rating = -1, r => r.quote = '', r => r.sourceUrl = 'https://upwork.com.evil.test/a', r => r.sourceUrl = 'javascript:alert(1)', r => r.sourceUrl = 'https://user:password@upwork.com/a', r => { r.platform = 'slack'; r.sourceUrl = 'https://workspace.slack.com/archives/secret'; }, r => r.scope = 'projects', r => r.projectIds = ['a', 'a'], r => { r.sourceAccess = 'private'; r.privateSource = ''; }]) {
    const next = structuredClone(review); mutate(next); assert.throws(() => validateReports([next]));
  }
  const minimal = structuredClone(review); delete minimal.rating;
  assert.equal(validateReports([minimal])[0].rating, null);
  const catalog = structuredClone(seed); catalog.reports = [{ ...review, projectIds: ['missing-project'] }];
  const allowedLocal = new Set([seed.hero.preview, ...seed.items.flatMap(i => [i.source.url, i.source.preview]).filter(Boolean)]);
  assert.throws(() => validateCatalog(catalog, { allowedLocal }));
  catalog.reports = [review]; catalog.items[0].batch = { reportId: review.id, code: 'B115' };
  assert.throws(() => validateCatalog(catalog, { allowedLocal }));
});
test('reviews only expose selected destinations and visible projects; private sources never become public links', () => {
  const catalog = structuredClone(seed); const id = catalog.items[0].id;
  catalog.reports = [{ ...review, sourceAccess: 'private', sourceUrl: 'https://www.upwork.com/private-reference', projectIds: [id], featured: false }];
  let published = publicCatalog(catalog); assert.equal(published.reports.length, 1); assert.equal(published.reports[0].sourceUrl, '');
  assert.ok(!JSON.stringify(published).includes('private-reference')); assert.ok(!JSON.stringify(published).includes('PRIVATE_REVIEW_NOTE'));
  catalog.items[0].visible = false; assert.equal(publicCatalog(catalog).reports.length, 0);
  catalog.reports[0].featured = true; published = publicCatalog(catalog); assert.equal(published.reports.length, 1); assert.deepEqual(published.reports[0].projectIds, []);
  catalog.reports[0].scope = 'projects'; assert.equal(publicCatalog(catalog).reports.length, 0);
  catalog.items[0].visible = true; catalog.reports[0].enabled = false; assert.equal(publicCatalog(catalog).reports.length, 0);
});
