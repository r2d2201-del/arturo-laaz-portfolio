import { thumbnail } from './lib/catalog.mjs';

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
    metric.append(element('i', 'fa-solid fa-eye'), document.createTextNode(` ${item.description}`));
    info.append(element('span', 'card-category', cat?.name || ''), element('h3', 'card-title', item.title), metric);
    card.append(media, info); grid.append(card);
  }
  if (!grid.children.length) grid.append(element('p', 'portfolio-empty', 'Próximamente, nuevos proyectos.'));
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
