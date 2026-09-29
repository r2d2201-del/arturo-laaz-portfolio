import { moveItem, thumbnail, youtubeId } from '/lib/catalog.mjs';
import { translationEditor } from './translation-editor.mjs';
import { metricsText } from '/lib/youtube-metrics-view.mjs';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
let catalog, revision = 0, publishedAt, history = [], dirty = false, unpublished = false, busy = false;
let filter = 'all', editing = null, source = null, sourceMode = 'youtube', selectedFile = null;
let uploadRunning = false, pendingUpload = null, connection, draggedId, filePrepared = false;
const editor = $('editor');
let toastTimer;
let projectEnglish, categoryEditors = [];
const libraryMetrics = new Map();
let libraryMetricsRequest = 0;
let translationQueue = [], translationTimer, translationPipeline = Promise.resolve();
function requestTranslations(texts) {
  return new Promise((resolve, reject) => {
    translationQueue.push({ texts, resolve, reject });
    clearTimeout(translationTimer);
    translationTimer = setTimeout(() => {
      const requests = translationQueue; translationQueue = [];
      translationPipeline = translationPipeline.catch(() => {}).then(async () => {
        while (requests.length) {
          const batch = []; let count = 0;
          while (requests.length && count + requests[0].texts.length <= 8) { const request = requests.shift(); count += request.texts.length; batch.push(request); }
          try {
            const texts = batch.flatMap((request, index) => request.texts.map(text => ({ ...text, id: `r${index}_${text.id}` })));
            const response = await api('translate', { method: 'POST', data: { texts } });
            batch.forEach((request, index) => request.resolve({ translations: request.texts.map(text => ({ id: text.id, text: response.translations.find(x => x.id === `r${index}_${text.id}`)?.text })) }));
          } catch (error) { batch.forEach(request => request.reject(error)); }
        }
      });
    }, 40);
  });
}
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = error ? 'error' : ''; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 10_000 : 5000);
}
async function api(path, { method = 'GET', data } = {}) {
  const response = await fetch(`/api/${path}`, { method, cache: 'no-store', headers: { 'X-Portfolio-Request': '1', ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(55_000) });
  const result = await response.json().catch(() => ({ error: 'El servidor no respondió correctamente.' }));
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') toast('La sesión terminó. Guarda una copia del catálogo y vuelve a entrar.', true);
    throw new Error(result.error || 'No se pudo completar la operación.');
  }
  return result;
}
async function task(fn) {
  if (busy) return;
  busy = true; $('studio').inert = true; $('editor-form').inert = true; $('categories-form').inert = true;
  try { return await fn(); }
  catch (e) { toast(e.message, true); if (editor.open) $('editor-message').textContent = e.message; if ($('categories-dialog').open) $('categories-message').textContent = e.message; }
  finally { busy = false; $('studio').inert = false; $('editor-form').inert = false; $('categories-form').inert = false; }
}
function confirmAction(title, message, label = 'Confirmar') {
  $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-ok').textContent = label;
  const dialog = $('confirm-dialog'); dialog.showModal();
  return new Promise(resolve => {
    const finish = value => { dialog.close(); $('confirm-ok').onclick = null; $('confirm-cancel').onclick = null; dialog.oncancel = null; resolve(value); };
    $('confirm-ok').onclick = () => finish(true); $('confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
  });
}
function markDirty() {
  dirty = true;
  try { localStorage.setItem('portfolio-unsaved', JSON.stringify({ revision, catalog })); } catch { /* server save remains available */ }
  status();
}
function status() {
  $('save-status').textContent = dirty ? 'Cambios sin guardar' : unpublished ? 'Borrador guardado · Pendiente de publicar' : 'Tu portafolio está al día';
  $('publish-status').textContent = publishedAt ? `Última publicación: ${new Date(publishedAt).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Los cambios se publican cuando tú lo decides.';
  $('save-btn').disabled = !dirty;
  $('publish-btn').disabled = !dirty && !unpublished;
}
async function saveDraft() {
  if (!dirty) return;
  const result = await api('draft', { method: 'PUT', data: { revision, catalog } });
  revision = result.revision; unpublished = result.hasUnpublishedChanges; dirty = false;
  localStorage.removeItem('portfolio-unsaved'); status(); void loadLibraryMetrics();
}
async function refresh() {
  const result = await api('draft');
  catalog = result.catalog; revision = result.revision; publishedAt = result.publishedAt; history = result.history;
  unpublished = result.hasUnpublishedChanges; dirty = false; render(); status(); void loadLibraryMetrics();
}
function renderLibraryMetrics() {
  document.querySelectorAll('[data-library-metrics-id]').forEach(box => {
    const metrics = libraryMetrics.get(box.dataset.libraryMetricsId);
    const text = metricsText(metrics);
    const values = el('div', 'studio-metrics-values');
    for (const value of text.values) {
      const field = el('div', 'studio-metric');
      field.title = `${value.label}: ${value.full}`;
      field.setAttribute('aria-label', field.title);
      field.append(el('strong', '', value.value), el('span', '', value.label));
      values.append(field);
    }
    const message = !metrics ? 'Guarda el borrador para cargar las métricas.'
      : metrics.status === 'unconfigured' ? 'Falta conectar YouTube para ver las métricas.' : text.status;
    box.replaceChildren(values, el('p', 'studio-metrics-status', message));
    if (metrics?.status === 'error') {
      const retry = el('button', 'text-button', 'Reintentar métricas');
      retry.onclick = () => void loadLibraryMetrics(); box.append(retry);
    }
  });
}
async function loadLibraryMetrics() {
  const request = ++libraryMetricsRequest;
  const ids = [...new Set(catalog.items.filter(item => item.source.type === 'youtube' && item.showYoutubeMetrics).map(item => item.source.youtubeId))];
  libraryMetrics.clear();
  for (const id of ids) libraryMetrics.set(id, { status: connection?.youtubeMetricsConfigured ? 'loading' : 'unconfigured' });
  renderLibraryMetrics();
  if (!ids.length || !connection?.youtubeMetricsConfigured) return;
  try {
    const result = await api('youtube-metrics-library');
    if (request !== libraryMetricsRequest) return;
    const byId = new Map(result.items.map(item => [item.id, item]));
    for (const id of ids) libraryMetrics.set(id, byId.get(id) || { status: 'error' });
  } catch {
    if (request !== libraryMetricsRequest) return;
    for (const id of ids) libraryMetrics.set(id, { status: 'error' });
  }
  renderLibraryMetrics();
}
async function enterStudio() {
  connection = await api('status');
  $('studio').hidden = false; $('login-screen').hidden = true;
  await refresh();
  $('upload-limit').textContent = `Hasta ${connection.maxUploadMB} MB por archivo · MP4, MOV, WebM y más`;
  if (!connection.uploadsConfigured) {
    $('service-notice').textContent = 'La biblioteca y los enlaces de YouTube están disponibles. Falta conectar el servicio de video para preparar archivos desde tu computadora.';
    $('service-notice').hidden = false;
  }
  let recovery;
  try { recovery = JSON.parse(localStorage.getItem('portfolio-unsaved')); } catch { /* ignore invalid local backup */ }
  if (recovery?.catalog && recovery.revision === revision && await confirmAction('Hay cambios sin guardar', 'Esta computadora conserva cambios de tu última sesión. ¿Quieres recuperarlos como borrador?', 'Recuperar')) {
    catalog = recovery.catalog; markDirty(); render();
  } else if (recovery?.catalog && recovery.revision !== revision) {
    toast('Hay una copia local pendiente, pero el catálogo cambió en otra sesión. Descárgala antes de editar para conservarla.', true);
    const backup = el('button', 'text-button', 'Descargar cambios locales pendientes');
    backup.onclick = () => download(recovery.catalog, 'cambios-locales-pendientes.json');
    $('service-notice').hidden = false; $('service-notice').append(backup);
  }
}
function render() {
  const tabs = $('category-filters'); tabs.replaceChildren();
  for (const category of [{ id: 'all', name: 'Todos' }, ...catalog.categories, { id: 'hidden', name: 'Ocultos' }]) {
    const b = el('button', category.id === filter ? 'active' : '', category.name);
    b.onclick = () => { filter = category.id; render(); }; tabs.append(b);
  }
  const query = $('search').value.toLocaleLowerCase().trim();
  const visibleItems = catalog.items.filter(item => (filter === 'all' || filter === 'hidden' && !item.visible || item.category === filter) && `${item.title} ${item.description}`.toLocaleLowerCase().includes(query));
  $('nav-count').textContent = catalog.items.length;
  $('results-count').textContent = `${visibleItems.length} proyectos · ${catalog.items.filter(x => x.visible).length} visibles`;
  const grid = $('project-grid'); grid.dataset.filter = filter; grid.replaceChildren();
  for (const item of visibleItems) grid.append(projectCard(item));
  $('empty-state').hidden = visibleItems.length > 0;
  if (!query && filter !== 'hidden') {
    const add = el('button', 'project-add'); add.append(el('span', 'plus', '+'), el('strong', '', 'Un nuevo proyecto'), el('small', '', 'Sube un video o pega un enlace'));
    add.onclick = () => openEditor(); grid.append(add);
  }
  renderLibraryMetrics();
}
function projectCard(item) {
  const card = el('article', `project-card${item.visible ? '' : ' is-hidden'}`); card.dataset.id = item.id; card.dataset.aspect = item.aspect;
  const media = el('div', 'project-media');
  if (item.source.preview) {
    const video = el('video'); video.src = `${new URL(item.source.preview, location.origin).href}#t=0.001`; video.muted = true; video.playsInline = true; video.preload = 'metadata';
    if (item.source.poster) video.poster = item.source.poster;
    media.append(video);
  } else if (item.source.poster || item.source.type === 'youtube') {
    const img = el('img'); img.src = item.source.poster || thumbnail(item.source.youtubeId); img.alt = item.title; img.loading = 'lazy'; media.append(img);
  }
  const flags = el('div', 'card-flags');
  flags.append(el('span', 'pill', item.source.type === 'youtube' ? 'YOUTUBE' : item.aspect === 'portrait' ? 'VERTICAL' : 'VIDEO'));
  if (catalog.hero.projectId === item.id) flags.append(el('span', 'pill featured', '✦ PORTADA'));
  else if (!item.visible) flags.append(el('span', 'pill', 'OCULTO'));
  const edit = el('button', 'card-edit-cover', 'Editar ↗'); edit.setAttribute('aria-label', `Editar ${item.title}`); edit.onclick = () => openEditor(item.id);
  media.append(flags, edit);
  const body = el('div', 'card-body');
  body.append(el('p', 'card-category', catalog.categories.find(x => x.id === item.category)?.name), el('h3', '', item.title), el('p', 'card-description', item.description));
  if (item.source.type === 'youtube' && item.showYoutubeMetrics) {
    const metrics = el('div', 'studio-metrics'); metrics.dataset.libraryMetricsId = item.source.youtubeId;
    metrics.setAttribute('role', 'group'); metrics.setAttribute('aria-label', 'Métricas de YouTube'); body.append(metrics);
  }
  const bottom = el('div', 'card-bottom');
  const order = el('div', 'card-order');
  const handle = el('button', 'drag-handle', '⠿'); handle.draggable = true; handle.setAttribute('aria-label', `Arrastrar ${item.title}`);
  handle.addEventListener('dragstart', event => { draggedId = item.id; event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
  handle.addEventListener('dragend', () => { draggedId = null; document.querySelectorAll('.project-card').forEach(x => x.classList.remove('dragging', 'drag-over')); });
  card.addEventListener('dragover', event => { if (!draggedId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('drag-over'); });
  card.addEventListener('dragleave', event => { if (!card.contains(event.relatedTarget)) card.classList.remove('drag-over'); });
  card.addEventListener('drop', event => { event.preventDefault(); if (!draggedId || busy) return; catalog.items = moveItem(catalog.items, draggedId, item.id); draggedId = null; markDirty(); render(); });
  order.append(handle, el('span', '', `${String(catalog.items.indexOf(item) + 1).padStart(2, '0')}`));
  const actions = el('div', 'card-actions');
  for (const [symbol, delta, label] of [['↑', -1, 'Subir'], ['↓', 1, 'Bajar']]) {
    const b = el('button', '', symbol); b.setAttribute('aria-label', `${label} ${item.title}`);
    const index = catalog.items.indexOf(item); b.disabled = index + delta < 0 || index + delta >= catalog.items.length;
    b.onclick = () => { const target = catalog.items[index + delta]; catalog.items = moveItem(catalog.items, item.id, target.id); markDirty(); render(); toast('Orden actualizado. Guarda el borrador cuando termines.'); };
    actions.append(b);
  }
  const visibility = el('button', '', item.visible ? 'Ocultar' : 'Mostrar');
  visibility.onclick = () => { item.visible = !item.visible; if (!item.visible && catalog.hero.projectId === item.id) catalog.hero.projectId = null; markDirty(); render(); };
  actions.append(visibility); bottom.append(order, actions); body.append(bottom); card.append(media, body); return card;
}

function setSourceMode(mode) {
  sourceMode = mode;
  document.querySelectorAll('[data-source]').forEach(b => b.classList.toggle('selected', b.dataset.source === mode));
  $('youtube-fields').hidden = mode !== 'youtube'; $('upload-fields').hidden = mode !== 'upload';
  $('youtube-metrics-help').textContent = connection?.youtubeMetricsConfigured
    ? 'Al guardar el proyecto verás las cifras en su tarjeta de Studio. Publícalo para mostrarlas en la web. Se actualizan aproximadamente cada hora; los datos no disponibles se indican con —.'
    : 'Falta conectar YouTube Data API. Puedes guardar esta opción; las cifras aparecerán cuando se configure el servicio.';
  $('upload-btn').disabled = !connection?.uploadsConfigured;
  $('upload-notice').hidden = Boolean(connection?.uploadsConfigured);
}
function showSource() {
  const box = $('source-preview'); box.replaceChildren(); box.hidden = !source;
  $('check-youtube-metrics').disabled = !connection?.youtubeMetricsConfigured || source?.type !== 'youtube';
  $('youtube-metrics-result').hidden = true;
  $('project-featured').disabled = !source?.preview;
  if (!source) return;
  if (source.poster || source.youtubeId) { const image = el('img'); image.src = source.poster || thumbnail(source.youtubeId); image.alt = 'Portada del proyecto'; box.append(image); }
  else if (source.preview) { const video = el('video'); video.src = source.preview.startsWith('http') ? source.preview : `/${source.preview}`; video.controls = true; video.muted = true; box.append(video); }
  box.append(el('p', '', source.type === 'youtube' ? 'Enlace verificado. Miniatura automática y reproducción desde YouTube.' : 'Video listo. Se conservará la proporción original.'));
  $('project-featured').disabled = !source.preview;
  if (!source.preview) $('project-featured').checked = false;
}
function openEditor(id = null) {
  projectEnglish?.dispose();
  editing = id; selectedFile = null; pendingUpload = null; filePrepared = false; $('editor-form').reset(); $('editor-message').textContent = '';
  $('drop-zone').querySelector('strong').textContent = '↥ Arrastra tu video aquí';
  const item = catalog.items.find(x => x.id === id);
  source = item ? structuredClone(item.source) : null;
  $('editor-title').textContent = item ? 'Editar proyecto' : 'Añadir proyecto';
  $('project-category').replaceChildren(...catalog.categories.map(c => { const o = el('option', '', c.name); o.value = c.id; return o; }));
  $('project-category').value = item?.category || (catalog.categories.some(c => c.id === filter) ? filter : catalog.categories[0].id);
  $('project-title').value = item?.title || ''; $('project-title-en').value = item?.titleEn || '';
  $('project-description').value = item?.description || ''; $('project-description-en').value = item?.descriptionEn || '';
  $('project-aspect').value = item?.aspect || 'portrait'; $('project-visible').checked = item?.visible ?? true;
  $('project-featured').checked = Boolean(id && catalog.hero.projectId === id);
  $('project-youtube-metrics').checked = item?.showYoutubeMetrics === true;
  $('youtube-url').value = source?.youtubeId ? `https://www.youtube.com/watch?v=${source.youtubeId}` : '';
  $('source-note').textContent = item?.note || 'Puedes conservar la fuente actual o reemplazarla.';
  $('remove-btn').hidden = !item; $('upload-progress').hidden = true; $('retry-upload').hidden = true;
  projectEnglish = translationEditor(['title', 'description'].map(key => ({
    key, source: $(`project-${key}`), target: $(`project-${key}-en`), status: $(`${key}-translation-status`), reset: $(`${key}-translation-reset`),
  })), item?.english, requestTranslations);
  setSourceMode(item?.source.type === 'video' ? 'upload' : 'youtube'); showSource(); editor.showModal();
}
function closeEditor() {
  if (uploadRunning) { toast('Espera a que termine la carga para cerrar el editor.', true); return; }
  editor.close();
}
editor.addEventListener('close', () => projectEnglish?.dispose());
$('close-editor').onclick = closeEditor; $('cancel-editor').onclick = closeEditor;
editor.addEventListener('cancel', event => { if (uploadRunning || busy) event.preventDefault(); });
document.querySelectorAll('[data-source]').forEach(button => { button.onclick = () => { if (!uploadRunning) setSourceMode(button.dataset.source); }; });
$('import-youtube').onclick = () => task(async () => {
  const result = await api('youtube', { method: 'POST', data: { url: $('youtube-url').value } });
  source = { type: 'youtube', youtubeId: result.id, poster: result.poster, url: '', preview: '', assetId: '' };
  if (!$('project-title').value) $('project-title').value = result.title;
  $('project-aspect').value = result.aspect; $('source-note').textContent = ''; $('editor-message').textContent = ''; showSource(); projectEnglish.schedule();
});
$('check-youtube-metrics').onclick = () => task(async () => {
  if (source?.type !== 'youtube') return;
  const result = $('youtube-metrics-result'); result.hidden = false; result.textContent = 'Consultando YouTube…';
  try {
    const data = await api('youtube-metrics-preview', { method: 'POST', data: { id: source.youtubeId } });
    const text = metricsText(data);
    result.textContent = data.status === 'available'
      ? `${text.values.map(value => `${value.label}: ${value.full}`).join(' · ')}. ${text.status}.`
      : 'YouTube no devuelve métricas para este video. Comprueba que siga disponible.';
  } catch (error) { result.textContent = error.message; }
});
function chooseFile(file) {
  selectedFile = file;
  filePrepared = false;
  if (!file) return;
  $('drop-zone').querySelector('strong').textContent = file.name;
  if (!$('project-title').value) $('project-title').value = file.name.replace(/\.[^.]+$/, '').slice(0, 140);
  projectEnglish.schedule();
}
$('video-file').onchange = event => chooseFile(event.target.files[0]);
$('drop-zone').addEventListener('dragover', event => { event.preventDefault(); $('drop-zone').classList.add('over'); });
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('over'));
$('drop-zone').addEventListener('drop', event => { event.preventDefault(); $('drop-zone').classList.remove('over'); if (!uploadRunning) chooseFile(event.dataTransfer.files[0]); });

async function sendFile(file, ticket) {
  const chunkSize = 6 * 1024 * 1024;
  for (let start = 0; start < file.size; start += chunkSize) {
    const end = Math.min(start + chunkSize, file.size);
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const form = new FormData();
          for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
          form.append('file', file.slice(start, end), file.name);
          const xhr = new XMLHttpRequest(); xhr.open('POST', ticket.url); xhr.timeout = 180_000;
          xhr.setRequestHeader('X-Unique-Upload-Id', ticket.id); xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`);
          xhr.upload.onprogress = event => { if (event.lengthComputable) { const percent = Math.min(99, Math.round((start + (end - start) * event.loaded / event.total) / file.size * 100)); $('upload-progress').querySelector('progress').value = percent; $('upload-progress').querySelector('p').textContent = `Subiendo ${file.name} · ${percent}%`; } };
          xhr.onload = () => { let data = {}; try { data = JSON.parse(xhr.responseText); } catch { /* handled below */ } if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.error?.message || 'No se pudo subir el archivo. Comprueba la conexión y los límites de tu cuenta.')); };
          xhr.onerror = () => reject(new Error('Se interrumpió la conexión durante la carga.'));
          xhr.ontimeout = () => reject(new Error('La carga tardó demasiado. Intenta nuevamente.'));
          xhr.send(form);
        });
        done = true;
      } catch (e) { if (attempt === 2) throw e; await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1))); }
    }
  }
}
async function waitForVideo() {
  for (let attempt = 0; attempt < 36; attempt++) {
    const result = await api(`uploads/${pendingUpload}`);
    if (result.status === 'ready') {
      filePrepared = true;
      source = result.source; $('project-aspect').value = result.aspect; $('upload-progress').querySelector('progress').value = 100;
      $('upload-progress').querySelector('p').textContent = 'Listo: video optimizado, clip y portada preparados.';
      $('source-note').textContent = ''; $('editor-message').textContent = ''; $('retry-upload').hidden = true; showSource(); return;
    }
    $('upload-progress').querySelector('p').textContent = 'Preparando video, vista previa y portada en la nube…';
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('El video sigue procesándose. Pulsa «Comprobar de nuevo» dentro de unos minutos; no hace falta volver a subirlo.');
}
$('upload-btn').onclick = async () => {
  if (uploadRunning || busy) return;
  if (!selectedFile) { $('editor-message').textContent = 'Selecciona un archivo de video.'; return; }
  if (selectedFile.size > connection.maxUploadMB * 1024 ** 2) { $('editor-message').textContent = `El máximo configurado es ${connection.maxUploadMB} MB.`; return; }
  uploadRunning = true; $('upload-btn').disabled = true; $('save-project').disabled = true; $('upload-progress').hidden = false; $('editor-message').textContent = '';
  try {
    const ticket = await api('upload-sign', { method: 'POST', data: { size: selectedFile.size, name: selectedFile.name, start: Number($('preview-start').value) } });
    pendingUpload = ticket.id;
    await sendFile(selectedFile, ticket);
    await waitForVideo();
  } catch (e) { $('editor-message').textContent = e.message; $('retry-upload').hidden = !pendingUpload; }
  finally { uploadRunning = false; $('upload-btn').disabled = !connection.uploadsConfigured; $('save-project').disabled = false; }
};
$('retry-upload').onclick = async () => {
  if (!pendingUpload || uploadRunning) return;
  uploadRunning = true; $('retry-upload').disabled = true; $('save-project').disabled = true;
  try { await waitForVideo(); } catch (e) { $('editor-message').textContent = e.message; }
  finally { uploadRunning = false; $('retry-upload').disabled = false; $('save-project').disabled = false; }
};
$('editor-form').onsubmit = event => {
  event.preventDefault();
  if (uploadRunning) return;
  if (!source) { $('editor-message').textContent = 'Obtén los datos de YouTube o prepara un video antes de guardar.'; return; }
  if (sourceMode === 'youtube' && youtubeId($('youtube-url').value) !== source.youtubeId) { $('editor-message').textContent = 'Pulsa «Obtener datos» para comprobar el enlace nuevo.'; return; }
  if (sourceMode === 'upload' && selectedFile && !filePrepared) { $('editor-message').textContent = 'Pulsa «Preparar video» y espera a que termine antes de guardar.'; return; }
  if (sourceMode === 'youtube' && source.type !== 'youtube' || sourceMode === 'upload' && source.type === 'youtube') { $('editor-message').textContent = 'Prepara la nueva fuente o vuelve a la pestaña de la fuente actual.'; return; }
  if ($('project-featured').checked && (!$('project-visible').checked || !source.preview)) { $('editor-message').textContent = 'La portada necesita un proyecto visible con un clip preparado.'; return; }
  task(async () => {
    $('editor-message').textContent = 'Preparando la versión en inglés…';
    await projectEnglish.ensureForSave();
    const id = editing || crypto.randomUUID();
    const previous = catalog.items.find(x => x.id === id);
    const note = previous && JSON.stringify(previous.source) === JSON.stringify(source) ? previous.note : '';
    const item = { id, title: $('project-title').value.trim(), titleEn: $('project-title-en').value.trim(), description: $('project-description').value.trim(), descriptionEn: $('project-description-en').value.trim(), english: projectEnglish.metadata(), category: $('project-category').value, aspect: $('project-aspect').value, visible: $('project-visible').checked, showYoutubeMetrics: source.type === 'youtube' && $('project-youtube-metrics').checked, source, note };
    const index = catalog.items.findIndex(x => x.id === id);
    if (index >= 0) catalog.items[index] = item; else catalog.items.unshift(item);
    editing = id;
    if ($('project-featured').checked) catalog.hero.projectId = id;
    else if (catalog.hero.projectId === id) catalog.hero.projectId = null;
    markDirty(); render(); await saveDraft(); editor.close(); toast('Proyecto guardado en el borrador.');
  });
};
$('remove-btn').onclick = async () => {
  if (uploadRunning || !editing) return;
  if (!await confirmAction('¿Quitar este proyecto?', 'Se quitará del borrador. El archivo se conserva y podrás recuperar versiones anteriores después de publicar.', 'Quitar proyecto')) return;
  task(async () => { catalog.items = catalog.items.filter(x => x.id !== editing); if (catalog.hero.projectId === editing) catalog.hero.projectId = null; markDirty(); render(); await saveDraft(); editor.close(); toast('Proyecto quitado del borrador.'); });
};
$('add-btn').onclick = () => openEditor();
$('search').oninput = render;
$('nav-library').onclick = () => { filter = 'all'; $('search').value = ''; render(); };
$('save-btn').onclick = () => task(async () => { await saveDraft(); toast('Borrador guardado.'); });
$('preview-btn').onclick = () => {
  const preview = window.open('about:blank', '_blank');
  if (preview) preview.opener = null;
  task(async () => { try { await saveDraft(); if (preview) preview.location.href = '/?preview=draft'; else toast('Permite abrir una pestaña para ver el borrador.', true); } catch (e) { preview?.close(); throw e; } });
};
$('publish-btn').onclick = async () => {
  const count = catalog.items.filter(x => x.visible).length;
  if (!await confirmAction('Publicar tu portafolio', `Se mostrarán ${count} proyectos en el orden del borrador. Los cambios estarán disponibles en tu página.`, 'Publicar ahora')) return;
  task(async () => { await saveDraft(); const result = await api('publish', { method: 'POST', data: { revision } }); revision = result.revision; publishedAt = result.publishedAt; unpublished = false; status(); await refresh(); toast('Tu portafolio está publicado.'); });
};
$('history-btn').onclick = () => task(async () => {
  const result = await api('draft'); history = result.history;
  const list = $('history-list'); list.replaceChildren();
  if (!history.length) list.append(el('p', 'field-help', 'Las versiones aparecerán después de tu primera publicación.'));
  for (const version of history) {
    const row = el('div', 'history-row'); row.append(el('span', '', version.date ? new Date(version.date).toLocaleString('es-EC') : 'Portafolio original'));
    const button = el('button', 'secondary', 'Restaurar');
    button.onclick = async () => {
      if (!await confirmAction('Recuperar esta versión', 'Reemplazará el borrador actual. El sitio publicado seguirá igual hasta que publiques.', 'Restaurar borrador')) return;
      task(async () => { await api('restore', { method: 'POST', data: { revision, id: version.id } }); localStorage.removeItem('portfolio-unsaved'); await refresh(); $('history-dialog').close(); toast('Versión recuperada como borrador.'); });
    };
    row.append(button); list.append(row);
  }
  $('history-dialog').showModal();
});
$('close-history').onclick = () => $('history-dialog').close();
$('history-mobile').onclick = () => $('history-btn').click();
function addCategoryRow(category) {
  const row = el('section', 'category-editor');
  const sourceId = `category-name-${category.id}`, targetId = `category-en-${category.id}`;
  const nameLabel = el('label', '', 'Nombre de la categoría'); nameLabel.htmlFor = sourceId;
  const name = el('input'); name.id = sourceId; name.required = true; name.maxLength = 80; name.value = category.name;
  const englishLabel = el('label', '', 'Nombre en inglés'); englishLabel.htmlFor = targetId;
  const nameEn = el('input'); nameEn.id = targetId; nameEn.maxLength = 80; nameEn.value = category.nameEn || '';
  const status = el('p'); status.setAttribute('role', 'status');
  const reset = el('button', 'text-button', 'Usar traducción automática'); reset.type = 'button';
  const feedback = el('div', 'translation-feedback'); feedback.append(status, reset);
  const count = catalog.items.filter(x => x.category === category.id).length;
  row.append(el('p', 'category-project-count', `${count} ${count === 1 ? 'proyecto' : 'proyectos'}`), nameLabel, name, englishLabel, nameEn, feedback);
  $('categories-list').append(row);
  const translator = translationEditor([{ key: 'name', source: name, target: nameEn, status, reset }], category.english, requestTranslations);
  categoryEditors.push({ category, name, nameEn, translator });
  $('add-category').disabled = categoryEditors.length >= 30;
  return name;
}
$('categories-btn').onclick = () => {
  categoryEditors.forEach(x => x.translator.dispose()); categoryEditors = [];
  $('categories-list').replaceChildren(); $('categories-message').textContent = '';
  catalog.categories.forEach(addCategoryRow); $('categories-dialog').showModal();
};
$('categories-inline').onclick = () => $('categories-btn').click();
$('add-category').onclick = () => {
  if (categoryEditors.length >= 30) return;
  addCategoryRow({ id: `category-${crypto.randomUUID()}`, name: '', nameEn: '' }).focus();
};
$('categories-dialog').addEventListener('close', () => categoryEditors.forEach(x => x.translator.dispose()));
$('categories-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('close-categories').onclick = $('cancel-categories').onclick = () => $('categories-dialog').close();
$('categories-form').onsubmit = event => {
  event.preventDefault();
  task(async () => {
    $('categories-message').textContent = 'Preparando los nombres en inglés…';
    if (categoryEditors.some(x => !x.name.value.trim())) throw new Error('Escribe un nombre para cada categoría.');
    await Promise.all(categoryEditors.map(item => item.translator.ensureForSave()));
    catalog.categories = categoryEditors.map(({ category, name, nameEn, translator }) => ({ id: category.id, name: name.value.trim(), nameEn: nameEn.value.trim(), english: translator.metadata() }));
    markDirty(); render(); await saveDraft(); $('categories-dialog').close(); toast('Categorías guardadas en el borrador. Publica cuando estén listas.');
  });
};
$('help-btn').onclick = () => $('help-dialog').showModal();
$('help-mobile').onclick = () => $('help-dialog').showModal();
$('close-help').onclick = () => $('help-dialog').close();
function download(data, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('export-btn').onclick = () => download(catalog, `portafolio-${new Date().toISOString().slice(0, 10)}.json`);
$('logout').onclick = async () => {
  if (dirty && !await confirmAction('Hay cambios sin guardar', 'Guarda el borrador antes de salir si quieres continuar desde otra computadora.', 'Salir de todos modos')) return;
  task(async () => { await api('logout', { method: 'POST', data: {} }); location.reload(); });
};
$('login-form').onsubmit = async event => {
  event.preventDefault(); const button = $('login-form').querySelector('button'); button.disabled = true;
  try { await api('login', { method: 'POST', data: { password: $('password').value } }); $('password').value = ''; await enterStudio(); }
  catch (e) { $('login-message').textContent = e.message; } finally { button.disabled = false; }
};
window.addEventListener('beforeunload', event => { if (dirty || uploadRunning) { event.preventDefault(); event.returnValue = ''; } });
try {
  connection = await api('status');
  if (connection.authenticated) await enterStudio();
  else { $('login-message').textContent = connection.configured ? 'Solo tú puedes administrar este portafolio.' : 'Falta configurar el acceso privado en el servidor. Consulta la guía de instalación del proyecto.'; $('login-form').querySelector('button').disabled = !connection.configured; }
} catch { $('login-message').textContent = 'No se pudo conectar con el panel. Comprueba la conexión e intenta recargar.'; }
