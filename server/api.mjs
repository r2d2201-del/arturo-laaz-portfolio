import { createHash, randomUUID } from 'node:crypto';
import seed from '../data/catalog.json' with { type: 'json' };
import { validateCatalog, publicCatalog, youtubeId, thumbnail } from '../lib/catalog.mjs';
import { verifyPassword, createSession, checkSession, sessionToken, sessionCookie, sameOrigin } from './auth.mjs';
import { cloudConfigured, uploadTicket, inspectUpload } from './cloudinary.mjs';
import { translateTexts, translationConfigured } from './translate.mjs';
import { youtubeMetrics, youtubeMetricsConfigured } from './youtube-metrics.mjs';

const localMedia = new Set([seed.hero.preview, ...seed.items.flatMap(x => [x.source.url, x.source.preview, x.source.poster])].filter(Boolean));
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const digest = value => createHash('sha256').update(value).digest('hex');
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const reject = (status, message) => { throw new ApiError(status, message); };
async function body(req) {
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) reject(415, 'Se requiere JSON.');
  if (Number(req.headers.get('content-length')) > 1_000_000) reject(413, 'Solicitud demasiado grande.');
  const reader = req.body?.getReader();
  if (!reader) reject(400, 'Faltan datos.');
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 1_000_000) { await reader.cancel(); reject(413, 'Solicitud demasiado grande.'); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { reject(400, 'JSON inválido.'); }
}

export function createApi({ store, env = process.env, fetcher = fetch }) {
  const configured = () => Boolean(env.ADMIN_PASSWORD_HASH?.startsWith('scrypt:') && env.SESSION_SECRET?.length >= 32);
  const validate = value => {
    try { return validateCatalog(value, { allowedLocal: localMedia, cloudName: env.CLOUDINARY_CLOUD_NAME }); }
    catch (e) { reject(400, e.message); }
  };
  async function state() {
    const existing = await store.read('state');
    return existing || { etag: null, data: { revision: 0, publishedAt: null, draft: seed, published: seed, history: [] } };
  }
  async function saveState(current, next) {
    if (!await store.write('state', next, current.etag)) reject(409, 'El catálogo cambió desde otra pestaña o computadora. Recarga antes de guardar.');
  }
  async function authorize(req) {
    const token = sessionToken(req);
    if (!configured() || !checkSession(token, env.SESSION_SECRET) || !(await store.read(`sessions/${digest(token)}`))) reject(401, 'Inicia sesión para continuar.');
  }
  async function ensureMediaReady(catalog) {
    for (const item of catalog.items) {
      if (!item.source.assetId) {
        const fields = [item.source.url, item.source.preview].filter(Boolean);
        if (fields.some(url => !localMedia.has(url))) reject(400, 'El video no pertenece a una carga verificada.');
        continue;
      }
      const upload = await store.read(`uploads/${item.source.assetId}`);
      if (upload?.data.result?.status !== 'ready') reject(409, `El video «${item.title}» todavía se está procesando.`);
      for (const field of ['url', 'preview', 'poster']) if (item.source[field] !== upload.data.result.source[field]) reject(400, 'Los archivos de la carga no coinciden.');
    }
  }
  return async function handle(req, context = {}) {
    try {
      const path = new URL(req.url).pathname.replace(/\/$/, '');
      const method = req.method;
      const secure = new URL(req.url).protocol === 'https:';
      if (method !== 'GET' && !sameOrigin(req)) reject(403, 'Origen de la solicitud no permitido.');

      if (path === '/api/catalog' && method === 'GET') return json(publicCatalog((await state()).data.published));
      if (path === '/api/youtube-metrics' && method === 'GET') {
        const preview = new URL(req.url).searchParams.get('preview') === 'draft';
        if (preview) await authorize(req);
        const { data } = await state();
        return json(await youtubeMetrics(preview ? data.draft : data.published, { store, env, fetcher }));
      }
      if (path === '/api/status' && method === 'GET') {
        let authenticated = false;
        try { await authorize(req); authenticated = true; } catch (e) { if (e.status !== 401) throw e; }
        return json({ configured: configured(), authenticated, uploadsConfigured: authenticated && cloudConfigured(env), translationsConfigured: authenticated && translationConfigured(env), youtubeMetricsConfigured: authenticated && youtubeMetricsConfigured(env), maxUploadMB: Number(env.MAX_UPLOAD_MB) || 100 });
      }
      if (path === '/api/login' && method === 'POST') {
        if (!configured()) reject(503, 'El acceso privado aún no está configurado.');
        const bucket = Math.floor(Date.now() / 600_000);
        const key = `login-attempts/${bucket}/${digest(context.ip || 'unknown')}`;
        const attempts = await store.read(key);
        if (attempts?.data.count >= 8) reject(429, 'Demasiados intentos. Intenta nuevamente en diez minutos.');
        if (!await store.write(key, { count: (attempts?.data.count || 0) + 1 }, attempts?.etag || null)) reject(429, 'Espera un momento antes de intentar de nuevo.');
        const { password } = await body(req);
        if (!verifyPassword(password, env.ADMIN_PASSWORD_HASH)) reject(401, 'La contraseña no es correcta.');
        const token = createSession(env.SESSION_SECRET);
        await store.write(`sessions/${digest(token)}`, { createdAt: Date.now() });
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, secure) });
      }

      await authorize(req);
      if (path === '/api/youtube-metrics-library' && method === 'GET') {
        const { data } = await state();
        // The private library can preview opted-in projects before making them visible.
        const items = data.draft.items.map(item => ({ ...item, visible: true }));
        return json(await youtubeMetrics({ items }, { store, env, fetcher }));
      }
      if (path === '/api/youtube-metrics-preview' && method === 'POST') {
        const { id: input } = await body(req);
        const id = youtubeId(input);
        if (!id) reject(400, 'Selecciona un video válido de YouTube.');
        if (!youtubeMetricsConfigured(env)) reject(503, 'Falta configurar la clave de YouTube en Netlify y volver a desplegar.');
        const { data } = await state();
        const item = [...data.draft.items, ...data.published.items].find(item => item.source.type === 'youtube' && item.source.youtubeId === id);
        if (!item) reject(404, 'Guarda el proyecto primero para comprobar sus métricas.');
        const result = await youtubeMetrics({ items: [{ ...item, visible: true, showYoutubeMetrics: true }] }, { store, env, fetcher });
        const metrics = result.items[0];
        if (metrics?.status === 'error') reject(503, 'YouTube no respondió con las métricas. Comprueba la clave, la API habilitada y su cuota; después intenta nuevamente.');
        return json(metrics);
      }
      if (path === '/api/translate' && method === 'POST') {
        const { texts } = await body(req);
        return json(await translateTexts(texts, { store, env, fetcher }));
      }
      if (path === '/api/logout' && method === 'POST') {
        await store.remove(`sessions/${digest(sessionToken(req))}`);
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', secure, true) });
      }
      if (path === '/api/draft' && method === 'GET') {
        const { data } = await state();
        return json({ catalog: data.draft, revision: data.revision, publishedAt: data.publishedAt, hasUnpublishedChanges: JSON.stringify(data.draft) !== JSON.stringify(data.published), history: data.history });
      }
      if (path === '/api/draft' && method === 'PUT') {
        const input = await body(req);
        const current = await state();
        if (input.revision !== current.data.revision) reject(409, 'Hay cambios guardados desde otra sesión. Recarga para continuar.');
        const draft = validate(input.catalog);
        await ensureMediaReady(draft);
        const next = { ...current.data, revision: current.data.revision + 1, draft };
        await saveState(current, next);
        return json({ revision: next.revision, hasUnpublishedChanges: JSON.stringify(next.draft) !== JSON.stringify(next.published) });
      }
      if (path === '/api/publish' && method === 'POST') {
        const { revision } = await body(req);
        const current = await state();
        if (revision !== current.data.revision) reject(409, 'El borrador cambió. Recarga antes de publicar.');
        const draft = validate(current.data.draft);
        await ensureMediaReady(draft);
        const publishedAt = new Date().toISOString();
        const archiveId = randomUUID();
        await store.write(`history/${archiveId}`, current.data.published);
        const next = { ...current.data, published: draft, publishedAt, revision: revision + 1, history: [{ id: archiveId, date: current.data.publishedAt, savedAt: publishedAt }, ...current.data.history].slice(0, 20) };
        await saveState(current, next);
        return json({ revision: next.revision, publishedAt });
      }
      if (path === '/api/restore' && method === 'POST') {
        const { revision, id } = await body(req);
        const current = await state();
        if (revision !== current.data.revision) reject(409, 'El borrador cambió. Recarga antes de restaurar.');
        if (!current.data.history.some(x => x.id === id)) reject(404, 'Versión no encontrada.');
        const snapshot = await store.read(`history/${id}`);
        if (!snapshot) reject(404, 'Versión no encontrada.');
        const next = { ...current.data, draft: validate(snapshot.data), revision: revision + 1 };
        await saveState(current, next);
        return json({ revision: next.revision });
      }
      if (path === '/api/youtube' && method === 'POST') {
        const { url } = await body(req);
        const id = youtubeId(url);
        if (!id) reject(400, 'Pega un enlace válido de YouTube o Shorts.');
        const response = await fetcher(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) reject(422, 'YouTube no permite consultar este video. Comprueba que sea público o no listado y permita insertarse.');
        const meta = await response.json();
        return json({ id, title: String(meta.title || '').slice(0, 140), poster: thumbnail(id), aspect: /\/shorts\//.test(url) ? 'portrait' : 'landscape' });
      }
      if (path === '/api/upload-sign' && method === 'POST') {
        if (!cloudConfigured(env)) reject(503, 'La carga de archivos necesita conectar Cloudinary. Puedes añadir enlaces de YouTube.');
        const { size, start = 0, name } = await body(req);
        const max = (Number(env.MAX_UPLOAD_MB) || 100) * 1024 ** 2;
        if (!Number.isSafeInteger(size) || size <= 0 || size > max) reject(400, 'El archivo supera el tamaño permitido.');
        if (typeof name !== 'string' || !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(name)) reject(400, 'Selecciona un archivo de video.');
        if (!Number.isFinite(start) || start < 0 || start > 36_000) reject(400, 'El inicio del clip debe expresarse en segundos.');
        const ticket = uploadTicket(env, Math.round(start * 10) / 10);
        const { upload, ...record } = ticket;
        await store.write(`uploads/${ticket.id}`, { ...record, size });
        return json({ id: ticket.id, ...upload });
      }
      if (/^\/api\/uploads\/[a-f0-9-]{36}$/.test(path) && method === 'GET') {
        if (!cloudConfigured(env)) reject(503, 'El servicio de video no está configurado.');
        const key = `uploads/${path.split('/').pop()}`;
        const existing = await store.read(key);
        if (!existing) reject(404, 'Carga no encontrada.');
        if (existing.data.result?.status === 'ready') return json(existing.data.result);
        const result = await inspectUpload(existing.data, env, fetcher);
        if (result.status === 'ready') await store.write(key, { ...existing.data, result });
        return json(result);
      }
      reject(404, 'Ruta no encontrada.');
    } catch (e) {
      if (!e.status) console.error('Portfolio API:', e.name, e.message);
      return json({ error: e.status ? e.message : 'No se pudo completar la operación. Tus cambios publicados siguen disponibles; intenta nuevamente.' }, e.status || 502);
    }
  };
}
