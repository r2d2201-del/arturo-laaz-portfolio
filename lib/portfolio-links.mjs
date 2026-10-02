export const supportedLanguage = value => ['es', 'en'].includes(value) ? value : null;

export function chooseLanguage(url, saved, languages = []) {
  const explicit = supportedLanguage(new URL(url).searchParams.get('lang'));
  if (explicit) return explicit;
  if (supportedLanguage(saved)) return saved;
  for (const language of languages) {
    const supported = supportedLanguage(String(language).toLowerCase().split(/[-_]/)[0]);
    if (supported) return supported;
  }
  return 'es';
}

// Shared links always point at the public site, never the admin or a private draft.
export function portfolioUrl(base, { category = 'all', video = null, language = null } = {}) {
  const url = new URL('/', base);
  if (supportedLanguage(language)) url.searchParams.set('lang', language);
  if (video) url.searchParams.set('video', video);
  else if (category !== 'all') url.searchParams.set('category', category);
  url.hash = 'portfolio';
  return url.href;
}

export function readPortfolioRoute(href, categories, projects) {
  const url = new URL(href);
  const requestedCategory = url.searchParams.get('category');
  const requestedVideo = url.searchParams.get('video');
  const validCategory = requestedCategory === 'all' || categories.includes(requestedCategory);
  let category = validCategory ? requestedCategory : 'all';
  const project = projects.find(item => item.id === requestedVideo && item.visible !== false);
  if (project && (!validCategory || category !== 'all' && category !== project.category)) category = project.category;
  return {
    category, video: project?.id || null,
    unavailable: Boolean(requestedVideo && !project),
    portfolio: Boolean(requestedCategory || requestedVideo || url.hash === '#portfolio'),
  };
}

let toastTimer;
export async function copyPortfolioLink(url, lang = 'es') {
  const en = lang === 'en';
  try {
    await navigator.clipboard.writeText(url);
    let toast = document.getElementById('share-feedback');
    if (!toast) {
      toast = document.createElement('div'); toast.id = 'share-feedback';
      toast.setAttribute('role', 'status'); document.body.append(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = en ? 'Link copied' : 'Enlace copiado'; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  } catch {
    window.prompt(en ? 'Copy this link:' : 'Copia este enlace:', url);
  }
}
