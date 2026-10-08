import { thumbnail } from './lib/catalog.mjs';
import { metricsText } from './lib/youtube-metrics-view.mjs';
import { batchEvidence, reviewEvidence, feedbackDate, platforms } from './lib/client-results.mjs';
let currentCatalog;

export function renderClientResults() {
  if (!currentCatalog) return;
  const lang = document.documentElement.lang || 'es';
  document.querySelectorAll('[data-batch-project]').forEach(box => {
    const item = currentCatalog.items.find(i => i.id === box.dataset.batchProject);
    const evidence = item && batchEvidence(currentCatalog, item, lang);
    const reviews = item ? reviewEvidence(currentCatalog, item.id) : [];
    box.replaceChildren(); box.hidden = !evidence && !reviews.length;
    if (!evidence) { if (reviews.length) box.append(element('strong', '', lang === 'en' ? 'Client feedback available' : 'Comentario del cliente disponible')); return; }
    box.append(element('strong', '', evidence.label));
    if (evidence.views) box.append(element('span', '', evidence.views));
    box.append(element('small', '', evidence.attribution));
  });
  renderTestimonials();
}
export function renderProjectDetails(id) {
  const box = document.getElementById('project-details');
  if (!box) return;
  box.replaceChildren();
  const item = currentCatalog?.items.find(i => i.id === id);
  if (!item) { box.hidden = true; return; }
  const lang = document.documentElement.lang || 'es';
  const description = lang === 'en' ? item.descriptionEn || item.description : item.description;
  if (description) box.append(element('p', 'project-description', description));
  const evidence = batchEvidence(currentCatalog, item, lang);
  if (evidence) {
    const section = element('section', 'project-evidence');
    section.append(element('h4', '', evidence.heading), element('strong', '', evidence.title), element('p', 'evidence-source', evidence.attribution));
    for (const detail of evidence.details) section.append(element('p', '', detail));
    section.append(element('p', 'evidence-scope', evidence.scope));
    if (evidence.aggregate) {
      const group = element('div', 'evidence-aggregate');
      group.append(element('h4', '', evidence.aggregateHeading), element('p', '', evidence.aggregate)); section.append(group);
    }
    box.append(section);
  }
  for (const review of reviewEvidence(currentCatalog, item.id)) box.append(reviewCard(review, lang, true));
  box.hidden = !box.childNodes.length;
}

function reviewCard(review, lang, linked = false) {
  const en = lang === 'en';
  const card = element('article', 'client-review');
  const top = element('div', 'review-top');
  const platform = platforms[review.platform] || (en ? 'Client feedback' : 'Comentario del cliente');
  top.append(element('span', 'review-platform', review.platform === 'other' ? (en ? 'Client feedback' : 'Comentario del cliente') : platform));
  if (review.rating != null) top.append(element('span', 'review-rating', `${review.rating}/5 · ${en ? 'Client rating' : 'Valoración del cliente'}`));
  card.append(top);
  const translated = lang !== review.language && (en ? review.quoteEn : review.quoteEs);
  const quote = element('blockquote', '', translated || review.quote); quote.lang = translated ? lang : review.language; card.append(quote);
  if (translated) {
    const details = element('details', 'review-original');
    details.append(element('summary', '', en ? 'Translated from Spanish · Read original' : 'Traducción del inglés · Leer original'));
    const original = element('p', '', review.quote); original.lang = review.language; details.append(original); card.append(details);
  }
  const attribution = review.client === review.attribution ? review.attribution : review.attribution + ' · ' + review.client;
  card.append(element('p', 'review-author', attribution));
  if (review.context) card.append(element('p', 'review-context', review.context));
  const datePrefix = review.dateKind === 'contract-end' ? (en ? 'Contract ended: ' : 'Cierre del contrato: ') : (en ? 'Comment: ' : 'Comentario: ');
  card.append(element('p', 'review-date', datePrefix + feedbackDate(review, lang)));
  if (linked) card.append(element('p', 'review-scope', review.scope === 'projects' ? (en ? 'Feedback about the linked project(s).' : 'Comentario sobre los proyectos vinculados.') : (en ? 'Feedback about the overall collaboration with this client.' : 'Comentario sobre la colaboración general con este cliente.')));
  if (review.sourceAccess === 'public' && review.sourceUrl) {
    const link = element('a', 'review-source', en ? 'View source ↗' : 'Consultar fuente original ↗'); link.href = review.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
  } else card.append(element('p', 'review-source-note', en ? 'Private feedback shared by Arturo · Source is not public.' : 'Comentario privado compartido por Arturo · Fuente no pública.'));
  return card;
}
export function renderTestimonials() {
  const section = document.getElementById('testimonials');
  const list = document.getElementById('client-reviews');
  if (!section || !list) return;
  const reviews = currentCatalog ? reviewEvidence(currentCatalog) : [];
  section.hidden = !reviews.length;
  document.querySelectorAll('a[href="#testimonials"]').forEach(a => { a.hidden = !reviews.length; });
  list.replaceChildren(...reviews.map(r => reviewCard(r, document.documentElement.lang || 'es')));
}

const metricsById = new Map();
export function renderYouTubeMetrics() {
  const lang = document.documentElement.lang || 'es';
  document.querySelectorAll('[data-metrics-id]').forEach(box => {
    const text = metricsText(metricsById.get(box.dataset.metricsId), lang);
    const values = element('div', 'youtube-metrics-values');
    for (const value of text.values) {
      const field = element('div', 'youtube-metric');
      field.title = `${value.label}: ${value.full}`;
      field.setAttribute('aria-label', field.title);
      field.append(element('strong', '', value.value), element('span', '', value.label));
      values.append(field);
    }
    box.replaceChildren(values, element('p', 'youtube-metrics-status', text.status));
  });
}
async function loadYouTubeMetrics(isPreview) {
  if (!document.querySelector('[data-metrics-id]')) return;
  try {
    const response = await fetch(`/api/youtube-metrics${isPreview ? '?preview=draft' : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('Metrics unavailable');
    const result = await response.json();
    for (const item of result.items) metricsById.set(item.id, item);
  } catch { /* Metrics must never prevent viewing the portfolio. */ }
  for (const [id, value] of metricsById) if (value.status === 'loading') metricsById.set(id, { status: 'error' });
  renderYouTubeMetrics();
}

const element = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

export async function loadPortfolio() {
  const isPreview = new URLSearchParams(location.search).get('preview') === 'draft';
  try {
    const response = await fetch(isPreview ? '/api/draft' : '/api/catalog', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Catálogo no disponible');
    const result = await response.json();
    const catalog = isPreview ? result.catalog : result;
    renderCatalog(catalog);
    void loadYouTubeMetrics(isPreview);
    if (isPreview) {
      const banner = element('div', 'draft-banner', 'VISTA PREVIA · Borrador guardado. Los visitantes todavía no ven estos cambios.');
      document.body.prepend(banner);
    }
    return catalog;
  } catch (error) {
    // Keep the original static portfolio available if the catalog service is unreachable.
    if (isPreview) {
      document.getElementById('portfolio-grid').replaceChildren(element('p', '', 'No se pudo cargar el borrador. Inicia sesión en el panel y vuelve a abrir la vista previa.'));
      const banner = element('div', 'draft-banner', 'No se ha cargado la vista previa del borrador.');
      document.body.prepend(banner);
    }
    console.warn('Portfolio catalog:', error.message);
    return null;
  }
}

export function renderCatalog(catalog) {
  currentCatalog = catalog;
  const grid = document.getElementById('portfolio-grid');
  const filters = document.getElementById('portfolio-filters');
  if (!grid || !filters) return;
  const all = element('button', 'filter-btn active', 'Todo');
  all.dataset.filter = 'all'; all.dataset.i18n = 'filter_all';
  filters.replaceChildren(all);
  for (const category of catalog.categories) {
    const button = element('button', 'filter-btn', category.name);
    button.dataset.filter = category.id;
    button.dataset.categoryEs = category.name;
    button.dataset.categoryEn = category.nameEn || category.name;
    filters.append(button);
  }
  grid.replaceChildren();
  for (const item of catalog.items.filter(x => x.visible)) {
    const cat = catalog.categories.find(x => x.id === item.category);
    const card = element('div', `portfolio-card${item.aspect === 'landscape' ? ' horizontal-ratio' : ''}${item.aspect === 'square' ? ' square-ratio' : ''}`);
    card.tabIndex = 0; card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver ${item.title}`);
    card.dataset.projectId = item.id;
    card.dataset.category = item.category;
    card.dataset.originalTitle = item.title;
    card.dataset.originalMetric = item.description;
    card.dataset.originalCategory = cat?.name || item.category;
    card.dataset.titleEn = item.titleEn;
    card.dataset.metricEn = item.descriptionEn;
    card.dataset.categoryEn = cat?.nameEn || cat?.name || '';
    if (item.source.type === 'youtube') card.dataset.youtubeId = item.source.youtubeId;
    if (item.source.url) card.dataset.fullVideo = item.source.url;
    const media = element('div', 'card-media');
    const container = element('div', 'video-container-card');
    if (item.source.preview) {
      const video = element('video', 'card-video-preview');
      video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'metadata';
      if (item.source.poster) video.poster = item.source.poster;
      const source = document.createElement('source');
      source.src = `${item.source.preview}#t=0.001`; source.type = 'video/mp4';
      video.append(source); container.append(video);
    } else {
      const img = element('img', 'card-video-preview youtube-thumbnail');
      img.src = item.source.poster || thumbnail(item.source.youtubeId);
      img.alt = item.title; img.loading = 'lazy';
      img.addEventListener('error', () => { img.src = thumbnail(item.source.youtubeId, 'mqdefault'); }, { once: true });
      container.append(img);
      card.dataset.youtubeHover = 'true';
    }
    const overlay = element('div', 'card-overlay');
    const play = element('span', 'play-icon');
    play.append(element('i', 'fa-solid fa-play'));
    overlay.append(play); media.append(container, overlay);
    const info = element('div', 'card-info');
    const metric = element('div', 'card-metric');
    metric.append(document.createTextNode(item.description));
    info.append(element('span', 'card-category', cat?.name || ''), element('h3', 'card-title', item.title), metric);
    if (item.batch || reviewEvidence(catalog, item.id).length) {
      const evidence = element('div', 'client-evidence'); evidence.dataset.batchProject = item.id; info.append(evidence);
    }
    if (item.source.type === 'youtube' && item.showYoutubeMetrics === true) {
      const metrics = element('div', 'youtube-metrics');
      metrics.dataset.metricsId = item.source.youtubeId;
      metricsById.set(item.source.youtubeId, { status: 'loading' });
      info.append(metrics);
    }
    card.append(media, info); grid.append(card);
  }
  if (!grid.children.length) grid.append(element('p', 'portfolio-empty', 'Próximamente, nuevos proyectos.'));
  renderYouTubeMetrics();
  renderClientResults();
  const featured = catalog.items.find(x => x.id === catalog.hero.projectId && x.visible);
  const hero = document.getElementById('hero-preview-video');
  if (hero) {
    hero.src = featured?.source.preview || catalog.hero.preview;
    if (featured?.source.poster) hero.poster = featured.source.poster;
  }
  const info = document.querySelector('.video-overlay-info');
  if (info) {
    info.querySelector('h3').textContent = featured?.title || catalog.hero.title;
    info.querySelector('p').textContent = featured?.description || catalog.hero.description;
    info.querySelector('h3').dataset.textEn = featured?.titleEn || '';
    info.querySelector('p').dataset.textEn = featured?.descriptionEn || '';
    const badge = info.querySelector('.badge');
    badge.replaceChildren(element('i', 'fa-solid fa-bolt'), document.createTextNode(` ${catalog.hero.badge}`));
  }
}

let youtubeApi;
function getYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApi) youtubeApi = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YouTube no respondió.')), 12_000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); previous?.(); resolve(window.YT); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timeout); reject(new Error('YouTube no disponible.')); };
    document.head.append(script);
  });
  return youtubeApi;
}

export function attachYouTubePreviews() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let stopActive = () => {};
  document.querySelectorAll('[data-youtube-hover]').forEach(card => {
    let hovered = false, timer, player, host;
    const stop = () => {
      hovered = false; clearTimeout(timer);
      try { player?.destroy(); } catch { /* iframe may already be detached */ }
      player = null; host?.remove(); host = null;
    };
    card.addEventListener('mouseenter', () => {
      stopActive(); stopActive = stop; hovered = true;
      timer = setTimeout(async () => {
        try {
          const YT = await getYouTubeApi();
          if (!hovered) return;
          host = element('div', 'youtube-hover-player');
          // Put the player above the card's decorative overlay; do not cover player UI.
          card.querySelector('.video-container-card').append(host);
          player = new YT.Player(host, {
            width: '100%', height: '100%', videoId: card.dataset.youtubeId,
            playerVars: { playsinline: 1, rel: 0, origin: location.origin },
            events: {
              onReady: event => { if (hovered) { event.target.mute(); event.target.playVideo(); } else stop(); },
              onError: stop, onAutoplayBlocked: stop,
            },
          });
        } catch { stop(); }
      }, 500);
    });
    card.addEventListener('mouseleave', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  });
}
