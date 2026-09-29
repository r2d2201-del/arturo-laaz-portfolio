export const CATEGORY_IDS = ['vertical', 'ugc-ads', 'motion-graphics', 'youtube'];
export const YOUTUBE_ID = /^[\w-]{11}$/;

export function youtubeId(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (YOUTUBE_ID.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'youtube-nocookie.com'].includes(host)) {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(u.pathname)?.[1];
    }
    return id && YOUTUBE_ID.test(id) ? id : null;
  } catch { return null; }
}

export function thumbnail(id, quality = 'hqdefault') {
  return YOUTUBE_ID.test(id) ? `https://i.ytimg.com/vi/${id}/${quality}.jpg` : '';
}

export function moveItem(items, fromId, toId) {
  const next = [...items];
  const from = next.findIndex(x => x.id === fromId);
  const to = next.findIndex(x => x.id === toId);
  if (from < 0 || to < 0 || from === to) return next;
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function publicCatalog(catalog) {
  return {
    schemaVersion: 1, categories: catalog.categories.map(({ english, ...category }) => category), hero: catalog.hero,
    items: catalog.items.filter(x => x.visible).map(({ note, english, ...item }) => item),
  };
}

export function validateCatalog(input, { allowedLocal = new Set(), cloudName = '' } = {}) {
  const fail = message => { throw new Error(message); };
  const string = (value, max, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Texto inválido o demasiado largo.');
    return value.trim();
  };
  const media = (value, image = false) => {
    if (value === '') return '';
    string(value, 1500);
    if (allowedLocal.has(value)) return value;
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.hash) fail('URL de medio no permitida.');
      if (cloudName && u.hostname === 'res.cloudinary.com' && u.pathname.startsWith(`/${cloudName}/video/upload/`)) return value;
      if (image && u.hostname === 'i.ytimg.com' && /^\/vi\/[\w-]{11}\/(hqdefault|mqdefault|maxresdefault)\.jpg$/.test(u.pathname)) return value;
    } catch { /* A single validation message for malformed URLs. */ }
    fail('El medio debe pertenecer a tu biblioteca.');
  };
  const english = (value, fields) => {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Traducción inválida.');
    const result = {};
    for (const [key, max] of Object.entries(fields)) {
      const field = value[key];
      if (field === undefined) continue;
      if (!field || typeof field.custom !== 'boolean') fail('Traducción inválida.');
      result[key] = { source: string(field.source, max), automatic: string(field.automatic, max), custom: field.custom };
    }
    return { english: result };
  };
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.categories) || !Array.isArray(input.items)) fail('Catálogo inválido.');
  if (input.categories.length < 1 || input.categories.length > 30 || input.items.length > 250) fail('Límite de proyectos o categorías excedido.');
  const categories = input.categories.map(c => {
    if (!c || !/^[a-z0-9-]{1,50}$/.test(c.id) || ['all', 'hidden'].includes(c.id)) fail('Categoría inválida.');
    return { id: c.id, name: string(c.name, 80, true), nameEn: string(c.nameEn || '', 80), ...english(c.english, { name: 80 }) };
  });
  const categoryIds = new Set(categories.map(c => c.id));
  if (categoryIds.size !== categories.length) fail('Hay categorías duplicadas.');
  const ids = new Set();
  const items = input.items.map(item => {
    if (!item || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)) fail('Identificador de proyecto inválido o duplicado.');
    ids.add(item.id);
    if (!categoryIds.has(item.category) || !['portrait', 'landscape', 'square'].includes(item.aspect) || typeof item.visible !== 'boolean') fail('Categoría, proporción o visibilidad inválida.');
    const s = item.source;
    if (!s || !['youtube', 'video'].includes(s.type)) fail('Fuente de video inválida.');
    if (s.type === 'youtube' && !YOUTUBE_ID.test(s.youtubeId)) fail('Enlace de YouTube inválido.');
    const source = {
      type: s.type, youtubeId: s.type === 'youtube' ? s.youtubeId : '',
      url: media(s.url || ''), preview: media(s.preview || ''), poster: media(s.poster || '', true),
      assetId: string(s.assetId || '', 150),
    };
    if (s.type === 'video' && (!source.url || !source.preview)) fail('El video todavía no está listo.');
    return {
      id: item.id, title: string(item.title, 140, true), titleEn: string(item.titleEn || '', 140),
      description: string(item.description || '', 300), descriptionEn: string(item.descriptionEn || '', 300),
      category: item.category, visible: item.visible, aspect: item.aspect, source,
      note: string(item.note || '', 300),
      ...english(item.english, { title: 140, description: 300 }),
    };
  });
  const h = input.hero;
  if (!h || (h.projectId !== null && !items.some(x => x.id === h.projectId && x.visible && x.source.preview))) fail('El destacado debe ser un proyecto visible con un clip de vista previa.');
  const hero = { projectId: h.projectId, preview: media(h.preview || ''), title: string(h.title, 140, true), description: string(h.description || '', 300), badge: string(h.badge || '', 80) };
  return { schemaVersion: 1, categories, hero, items };
}
