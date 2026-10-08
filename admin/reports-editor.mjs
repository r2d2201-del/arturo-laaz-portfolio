import { validateReports, validateBatchLink, platforms } from '../lib/client-results.mjs';
const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; n.className = cls; return n; };
const button = (label, fn, cls = 'secondary') => { const b = el('button', label, cls); b.type = 'button'; b.onclick = fn; return b; };
let serial = 0;
function field(parent, label, value = '', { type = 'text', max = 100, placeholder = '', options } = {}) {
  const id = `feedback-field-${++serial}`, lab = el('label', label);
  lab.htmlFor = id;
  const input = el(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  input.id = id; input.maxLength = max; input.placeholder = placeholder;
  if (options) for (const [key, name] of Object.entries(options)) { const o = el('option', name); o.value = key; input.append(o); }
  else if (type === 'textarea') input.rows = 3; else input.type = type;
  if (type === 'checkbox') { input.checked = value; lab.prepend(input); lab.className = 'feedback-check'; parent.append(lab); }
  else { input.value = value; parent.append(lab, input); }
  return input;
}
const blank = kind => ({ id: crypto.randomUUID(), kind, client: '', attribution: '', date: '', dateKind: 'comment', enabled: false, qualifiedLeadPercent: null, privateSource: '', batches: [], platform: 'other', sourceAccess: 'private', sourceUrl: '', quote: '', language: 'en', rating: null, scope: 'collaboration', projectIds: [], featured: false, context: '', quoteEs: '', quoteEn: '' });

export function reportsEditor({ getCatalog, save }) {
  const dialog = el('dialog', '', 'editor-dialog reports-dialog');
  dialog.setAttribute('aria-label', 'Editar feedback'); document.body.append(dialog);
  let drafts = [], selected = '', links = {}, capture = () => {}, saving = false;
  const message = el('p', '', 'field-help'); message.setAttribute('role', 'status');
  dialog.addEventListener('cancel', e => { if (saving) e.preventDefault(); });
  function paint() {
    const report = drafts.find(r => r.id === selected); if (!report) return;
    const review = report.kind === 'review';
    dialog.replaceChildren();
    const heading = el('div', '', 'dialog-heading');
    heading.append(el('h2', review ? 'Reseña del cliente' : 'Resultados de campaña'), button('Cerrar', () => dialog.close(), 'text-button'));
    dialog.append(heading, el('p', review ? 'Conserva el comentario original y su fuente. Tú eliges dónde aparece.' : 'Registra lo que comunicó el cliente y vincula cada batch a los videos correspondientes.', 'field-help'));
    const form = el('form');
    form.addEventListener('invalid', event => { for (let d = event.target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true; }, true);
    const row = el('div', '', 'field-row'), left = el('div'), right = el('div'); row.append(left, right); form.append(row);
    const client = field(left, 'Cliente o marca pública', report.client, { placeholder: 'Nombre de la marca o Cliente de Upwork' });
    const platform = field(right, 'Plataforma de origen', report.platform || 'other', { options: platforms });
    const attribution = field(form, 'Autor o atribución pública', report.attribution, { placeholder: 'Nombre autorizado, equipo o Cliente de Upwork' });
    const dateRow = el('div', '', 'field-row'), dateLeft = el('div'), dateRight = el('div'); dateRow.append(dateLeft, dateRight); form.append(dateRow);
    const date = field(dateLeft, 'Fecha de referencia', report.date, { type: 'date' });
    const dateKind = field(dateRight, 'Qué representa esta fecha', report.dateKind || 'comment', { options: { comment: 'Fecha del comentario', 'contract-end': 'Cierre del contrato' } });
    const sourceAccess = field(form, 'Acceso a la fuente', report.sourceAccess || 'private', { options: { private: 'Mensaje privado · Slack, email u otra fuente', public: 'Reseña pública · Con enlace al original' } });
    const sourceUrl = field(form, 'Enlace público a la fuente (solo si es accesible)', report.sourceUrl || '', { type: 'url', max: 1500, placeholder: 'https://www.upwork.com/freelancers/…' });
    const updateSourceFields = () => { sourceUrl.hidden = sourceAccess.value !== 'public'; sourceUrl.previousElementSibling.hidden = sourceUrl.hidden; };
    sourceAccess.onchange = updateSourceFields; updateSourceFields();
    const privateDetails = el('details', '', 'batch-editor'); privateDetails.append(el('summary', 'Fuente privada · Solo para ti'));
    const privateSource = field(privateDetails, 'Texto, enlace privado o referencia a la captura', report.privateSource, { type: 'textarea', max: 5000 });
    privateDetails.append(el('p', 'Se conserva en el borrador y en tu exportación. No se muestra en la web ni se envía al asistente de títulos.', 'field-help')); form.append(privateDetails);
    const enabled = field(form, 'Habilitar al publicar el portafolio', report.enabled, { type: 'checkbox' });
    let readReview = () => ({}), getters = [], percent;
    if (review) {
      const quote = field(form, 'Comentario original · Sin reescribir', report.quote || '', { type: 'textarea', max: 3000 });
      const language = field(form, 'Idioma original', report.language || 'en', { options: { en: 'English', es: 'Español' } });
      const context = field(form, 'Encargo o contexto público', report.context || '', { max: 200, placeholder: 'Título del contrato en Upwork' });
      const rating = field(form, 'Valoración original sobre 5 (opcional)', report.rating ?? '', { type: 'number' }); rating.min = '0'; rating.max = '5'; rating.step = '0.01';
      form.append(el('p', 'Solo añade una valoración si la fuente la muestra. No se asignan estrellas automáticamente.', 'field-help'));
      const translation = el('details', '', 'batch-editor'); translation.append(el('summary', 'Traducciones revisadas (opcionales)'));
      const quoteEs = field(translation, 'Traducción al español', report.quoteEs || '', { type: 'textarea', max: 3000 });
      const quoteEn = field(translation, 'Traducción al inglés', report.quoteEn || '', { type: 'textarea', max: 3000 });
      translation.append(el('p', 'La web identifica las traducciones y permite consultar el original.', 'field-help')); form.append(translation);
      form.append(el('h3', 'Dónde se muestra'));
      const featured = field(form, 'Mostrar en la sección de reseñas de la web', report.featured === true, { type: 'checkbox' });
      const scope = field(form, 'De qué habla el comentario', report.scope || 'collaboration', { options: { collaboration: 'De la colaboración en general', projects: 'De los videos que seleccione' } });
      form.append(el('p', 'Puedes asociar una reseña general como contexto de colaboración. No se presentará como un resultado de cada video.', 'field-help'));
      const picks = projectPicker(form, getCatalog().items, item => {
        const check = field(item.row, item.project.title, report.projectIds?.includes(item.project.id) || false, { type: 'checkbox' });
        return () => check.checked ? item.project.id : null;
      });
      readReview = () => ({ quote: quote.value.trim(), language: language.value, context: context.value.trim(), rating: rating.value === '' ? null : Number(rating.value), quoteEs: quoteEs.value.trim(), quoteEn: quoteEn.value.trim(), featured: featured.checked, scope: scope.value, projectIds: picks.map(fn => fn()).filter(Boolean) });
    } else {
      percent = field(form, '% de anuncios activos que generaban leads cualificados (opcional)', report.qualifiedLeadPercent ?? '', { type: 'number' }); percent.min = '0'; percent.max = '100'; percent.step = '0.01';
      form.append(el('p', 'Dato del conjunto de anuncios de Arturo para este cliente en esa fecha, sin atribuirlo a cada video.', 'field-help'), el('h3', 'Batches del informe'));
      for (const [index, batch] of report.batches.entries()) {
        const box = el('details', '', 'batch-editor'); box.open = !batch.name;
        box.append(el('summary', `${batch.code || 'Nuevo batch'} · ${batch.name || 'Completar datos'}`));
        const code = field(box, 'Código del batch', batch.code, { max: 80 }); code.pattern = '[a-zA-Z0-9-]{1,80}'; code.required = true;
        const name = field(box, 'Nombre del batch', batch.name, { max: 140 }); name.required = true;
        const views = field(box, 'Visualizaciones reportadas para el batch (opcional)', batch.views ?? '', { type: 'number' }); views.min = '0'; views.step = '1';
        const highlighted = field(box, 'Destacado por el cliente entre los de mejor rendimiento', batch.highlighted, { type: 'checkbox' });
        const leadLeader = field(box, 'Entre los que generaban más leads cualificados según el cliente', batch.leadLeader, { type: 'checkbox' });
        code.readOnly = Object.values(links).some(link => link?.reportId === report.id && link.code === batch.code);
        box.append(button('Quitar batch', () => {
          capture();
          if (Object.values(links).some(link => link?.reportId === report.id && link.code === batch.code)) { message.textContent = 'Quita la asociación de sus videos antes de retirar este batch.'; return; }
          report.batches.splice(index, 1); paint();
        }, 'text-button'));
        getters.push(() => ({ code: code.value.trim(), name: name.value.trim(), views: views.value === '' ? null : Number(views.value), highlighted: highlighted.checked, leadLeader: leadLeader.checked })); form.append(box);
      }
      form.append(button('Añadir batch', () => { capture(); report.batches.push({ code: '', name: '', views: null, highlighted: false, leadLeader: false }); paint(); }));
      form.append(el('h3', 'Vincular videos subidos'), el('p', 'Elige el batch solo cuando confirmes la correspondencia. Puedes vincular varias versiones; los resultados seguirán siendo del batch.', 'field-help'));
    }
    // One select per video prevents assigning the same video to two batches.
    const linkReaders = review ? [] : projectPicker(form, getCatalog().items, ({ row, project }) => {
      const existing = links[project.id];
      const options = { '': 'Sin batch de este informe' };
      if (existing?.reportId && existing.reportId !== report.id) options.keep = `Conservar otro informe · ${existing.code}`;
      for (const batch of report.batches) if (batch.code) options[batch.code] = `${batch.code} · ${batch.name}`;
      const select = field(row, project.title, existing?.reportId === report.id ? existing.code : existing ? 'keep' : '', { options });
      return () => { if (select.value !== 'keep') links[project.id] = select.value ? { reportId: report.id, code: select.value } : null; };
    });
    capture = () => {
      linkReaders.forEach(fn => fn());
      Object.assign(report, { client: client.value.trim(), attribution: attribution.value.trim(), date: date.value, dateKind: dateKind.value, platform: platform.value, sourceAccess: sourceAccess.value, sourceUrl: sourceUrl.value.trim(), privateSource: privateSource.value.trim(), enabled: enabled.checked, ...readReview() });
      if (!review) Object.assign(report, { qualifiedLeadPercent: percent.value === '' ? null : Number(percent.value), batches: getters.map(fn => fn()) });
    };
    const actions = el('div', '', 'dialog-actions');
    const submit = el('button', 'Guardar feedback en borrador', 'primary'); submit.type = 'submit'; actions.append(button('Cancelar', () => dialog.close()), submit);
    form.append(message, actions, el('p', 'Revisa Vista previa antes de Publicar cambios.', 'field-help')); dialog.append(form);
    form.onsubmit = async event => {
      event.preventDefault(); if (saving) return;
      capture(); message.textContent = '';
      try {
        const reports = validateReports(drafts);
        for (const link of Object.values(links)) validateBatchLink(link, reports);
        saving = true; dialog.inert = true;
        await save(reports, links); dialog.close();
      } catch (e) { message.textContent = e.message; message.scrollIntoView({ block: 'nearest' }); }
      finally { saving = false; dialog.inert = false; }
    };
  }
  function open({ id, kind = 'review', incoming = [] } = {}) {
    drafts = structuredClone(getCatalog().reports || []);
    links = Object.fromEntries(getCatalog().items.map(i => [i.id, structuredClone(i.batch || null)]));
    if (incoming.some(r => drafts.some(d => d.id === r.id))) throw new Error('Este feedback ya existe. Ábrelo para editarlo.');
    drafts.push(...incoming);
    if (!id && !incoming.length) { const report = blank(kind); drafts.push(report); id = report.id; }
    selected = id || incoming[0].id; capture = () => {}; message.textContent = ''; paint(); dialog.showModal();
  }
  return { open };
}
function projectPicker(parent, items, makeControl) {
  const details = el('details', '', 'batch-editor project-picker'); details.append(el('summary', `Videos de la biblioteca (${items.length})`));
  const search = field(details, 'Buscar videos para vincular', '', { type: 'search', max: 200 });
  const list = el('div', '', 'feedback-projects'); const rows = [];
  const readers = items.map(project => { const row = el('div', '', 'feedback-project'); rows.push({ row, project }); const read = makeControl({ row, project }); if (!project.visible) row.append(el('small', 'Oculto en el portafolio', 'field-help')); list.append(row); return read; });
  search.oninput = () => { const query = search.value.trim().toLocaleLowerCase(); rows.forEach(({ row, project }) => { row.hidden = !project.title.toLocaleLowerCase().includes(query); }); };
  details.append(list); parent.append(details); return readers;
}
export function renderFeedbackLibrary(catalog, open) {
  const root = document.getElementById('feedback-list'); root.replaceChildren();
  const query = document.getElementById('feedback-search').value.toLocaleLowerCase().trim();
  const reports = (catalog.reports || []).filter(r => `${r.client} ${r.attribution} ${r.context || ''} ${r.quote || ''} ${platforms[r.platform] || ''}`.toLocaleLowerCase().includes(query));

  const featuredCount = (catalog.reports || []).filter(r => r.enabled && r.featured && r.kind === 'review').length;
  document.getElementById('feedback-count').textContent = (catalog.reports || []).length + ' registros · ' + featuredCount + (featuredCount === 1 ? ' reseña seleccionada para la web' : ' reseñas seleccionadas para la web');
  for (const report of reports) {
    const review = report.kind === 'review';
    const card = el('article', '', 'feedback-card');
    const count = review ? (report.projectIds || []).length : catalog.items.filter(i => i.batch?.reportId === report.id).length;
    card.append(el('p', `${platforms[report.platform] || 'Fuente privada'} / ${review ? 'RESEÑA' : 'RESULTADOS DE CAMPAÑA'}`, 'eyebrow'), el('h2', report.client || 'Cliente pendiente'), el('p', [report.attribution, report.date].filter(Boolean).join(' · '), 'field-help'));
    if (review) card.append(el('blockquote', report.quote || 'Comentario pendiente'));
    else card.append(el('p', `${report.batches.length} batches documentados. ${report.qualifiedLeadPercent == null ? '' : `${report.qualifiedLeadPercent}% de los anuncios activos generaba leads cualificados, según el cliente.`}`));
    if (report.context) card.append(el('p', report.context, 'field-help'));
    const state = !report.enabled ? 'Guardado · Oculto' : review && report.featured ? 'Seleccionado para reseñas de la web' : count ? 'En videos vinculados' : 'Pendiente de vincular videos';
    card.append(el('p', `${state} · ${count} ${count === 1 ? 'video asociado' : 'videos asociados'}`, 'feedback-state'));
    if (report.rating != null && review) card.append(el('p', `${report.rating}/5 · Valoración original`, 'field-help'));
    const actions = el('div', '', 'feedback-card-actions'); actions.append(button('Editar y vincular videos ↗', () => open({ id: report.id })));
    if (report.sourceAccess === 'public' && report.sourceUrl) { const a = el('a', 'Consultar fuente ↗', 'text-button'); a.href = report.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; actions.append(a); }
    card.append(actions); root.append(card);
  }
  if (!reports.length) root.append(el('p', query ? 'No hay comentarios que coincidan con tu búsqueda.' : 'Añade tu primera reseña o registra los resultados que te haya compartido un cliente.', 'feedback-empty'));
}
