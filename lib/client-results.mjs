const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new Error('Completa los textos del informe sin superar sus límites.');
  return value.trim();
}
export function validReportDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export const platforms = { upwork: 'Upwork', slack: 'Slack', email: 'Email', linkedin: 'LinkedIn', other: 'Otra fuente' };
export function publicSourceUrl(value = '', platform = 'other') {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (value.length > 1500 || url.protocol !== 'https:' || url.username || url.password) throw new Error();
    const host = url.hostname.toLowerCase();
    const isHost = domain => host === domain || host.endsWith('.' + domain);
    if (platform === 'upwork' && !isHost('upwork.com') || platform === 'linkedin' && !isHost('linkedin.com') || isHost('slack.com')) throw new Error();
    return url.href;
  } catch { throw new Error('Usa un enlace HTTPS público de la plataforma indicada. Los enlaces privados de Slack van en Fuente privada.'); }
}
export function validateReports(input = []) {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Demasiados registros de feedback.');
  const ids = new Set();
  return input.map(report => {
    if (!report || !idPattern.test(report.id) || ids.has(report.id) || typeof report.enabled !== 'boolean') throw new Error('Identificador o estado de informe inválido.');
    ids.add(report.id);
    const date = text(report.date ?? '', 10);
    if (date && !validReportDate(date) || report.enabled && !date) throw new Error('Añade la fecha real del comentario antes de mostrar sus resultados.');
    const client = text(report.client ?? '', 100, report.enabled);
    const attribution = text(report.attribution ?? '', 100, report.enabled);
    const percent = report.qualifiedLeadPercent ?? null;
    if (percent !== null && (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100)) throw new Error('El porcentaje debe estar entre 0 y 100.');
    if (!Array.isArray(report.batches) || report.batches.length > 100) throw new Error('Lista de batches inválida.');
    const codes = new Set();
    const batches = report.batches.map(batch => {
      if (!batch || !idPattern.test(batch.code) || codes.has(batch.code) || typeof batch.highlighted !== 'boolean' || typeof batch.leadLeader !== 'boolean') throw new Error('Revisa los códigos y resultados de los batches; no deben repetirse.');
      codes.add(batch.code);
      const views = batch.views ?? null;
      if (views !== null && (!Number.isSafeInteger(views) || views < 0)) throw new Error('Las visualizaciones deben ser un número entero positivo o cero.');
      return { code: batch.code, name: text(batch.name, 140, true), highlighted: batch.highlighted, leadLeader: batch.leadLeader, views };
    });
    const kind = report.kind ?? 'results';
    const platform = report.platform ?? 'other';
    const sourceAccess = report.sourceAccess ?? 'private';
    const scope = report.scope ?? 'collaboration';
    const dateKind = report.dateKind ?? 'comment';
    if (!['review', 'results'].includes(kind) || !Object.hasOwn(platforms, platform) || !['public', 'private'].includes(sourceAccess) || !['collaboration', 'projects'].includes(scope) || !['comment', 'contract-end'].includes(dateKind)) throw new Error('Revisa el tipo, la fuente y el alcance del feedback.');
    const sourceUrl = publicSourceUrl(report.sourceUrl ?? '', platform);
    const privateSource = text(report.privateSource ?? '', 5000);
    const quote = text(report.quote ?? '', 3000, kind === 'review' && report.enabled);
    const language = report.language ?? 'en';
    if (!['en', 'es'].includes(language)) throw new Error('Selecciona el idioma original.');
    const rating = report.rating ?? null;
    if (rating !== null && (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5)) throw new Error('La valoración debe ser un número entre 0 y 5 o quedar vacía.');
    const projectIds = report.projectIds ?? [];
    if (!Array.isArray(projectIds) || projectIds.length > 250 || projectIds.some(id => typeof id !== 'string' || !idPattern.test(id)) || new Set(projectIds).size !== projectIds.length) throw new Error('Revisa los videos vinculados al comentario.');
    if (report.featured !== undefined && typeof report.featured !== 'boolean') throw new Error('Revisa la opción de reseña en la web.');
    if (kind === 'review' && report.enabled) {
      if (sourceAccess === 'public' ? !sourceUrl : !privateSource) throw new Error('Conserva la fuente original antes de mostrar la reseña.');
      if (scope === 'projects' && !projectIds.length) throw new Error('Vincula al menos un video o cambia el alcance a la colaboración.');
    }
    return { id: report.id, kind, client, attribution, date, dateKind, enabled: report.enabled, qualifiedLeadPercent: percent, batches, privateSource,
      platform, sourceAccess, sourceUrl, quote, language, rating, scope, projectIds, featured: kind === 'review' && report.featured === true,
      context: text(report.context ?? '', 200), quoteEs: text(report.quoteEs ?? '', 3000), quoteEn: text(report.quoteEn ?? '', 3000) };

  });
}
export function validateBatchLink(link, reports) {
  if (link == null) return null;
  if (!link || typeof link !== 'object' || !reports.some(r => r.kind !== 'review' && r.id === link.reportId && r.batches.some(b => b.code === link.code))) throw new Error('El batch seleccionado ya no existe. Revisa su informe.');
  return { reportId: link.reportId, code: link.code };
}
export function publicReports(reports = [], items = []) {
  return reports.filter(r => r.enabled && validReportDate(r.date) && r.client && r.attribution).map(r => {
    const common = { id: r.id, kind: r.kind || 'results', client: r.client, attribution: r.attribution, date: r.date, dateKind: r.dateKind || 'comment', enabled: true,
      platform: r.platform || 'other', sourceAccess: r.sourceAccess || 'private', sourceUrl: r.sourceAccess === 'public' ? publicSourceUrl(r.sourceUrl, r.platform) : '' };
    if (r.kind === 'review') {
      const projectIds = (r.projectIds || []).filter(id => items.some(i => i.id === id && i.visible));
      if (!r.quote || r.scope === 'projects' && !projectIds.length || !r.featured && !projectIds.length) return null;
      return { ...common, quote: r.quote, language: r.language, quoteEs: r.quoteEs, quoteEn: r.quoteEn, rating: r.rating ?? null, context: r.context, scope: r.scope, featured: r.featured === true, projectIds, batches: [] };
    }
    const batches = r.batches.filter(b => items.some(item => item.visible && item.batch?.reportId === r.id && item.batch.code === b.code)).map(b => ({ code: b.code, name: b.name, highlighted: b.highlighted, leadLeader: b.leadLeader, views: b.views }));
    return batches.length ? { ...common, qualifiedLeadPercent: r.qualifiedLeadPercent, batches } : null;
  }).filter(Boolean);
}
export function reviewEvidence(catalog, itemId = null) {
  return publicReports(catalog.reports, catalog.items).filter(r => r.kind === 'review' && (itemId ? r.projectIds.includes(itemId) : r.featured));
}
export function feedbackDate(report, lang = 'es') {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-EC', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(report.date + 'T12:00:00Z'));
}
export function batchEvidence(catalog, item, lang = 'es') {
  const report = publicReports(catalog.reports, [item]).find(r => r.id === item?.batch?.reportId);
  const batch = report?.batches.find(b => b.code === item.batch.code);
  if (!batch) return null;
  const en = lang === 'en';
  const date = new Intl.DateTimeFormat(en ? 'en-US' : 'es-EC', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${report.date}T12:00:00Z`));
  const attribution = `${report.client} · ${report.attribution} · ${date}`;
  const details = [];
  if (batch.highlighted) details.push(en ? 'Named by the client among the best-performing batches.' : 'Señalado por el cliente entre los batches de mejor rendimiento.');
  if (batch.leadLeader) details.push(en ? 'Named among the batches generating the most qualified leads from the live ads.' : 'Entre los batches que generaban más leads cualificados de los anuncios activos, según el cliente.');
  const views = batch.views == null ? '' : `${new Intl.NumberFormat(en ? 'en-US' : 'es-EC').format(batch.views)} ${en ? 'views reported for this batch' : 'visualizaciones reportadas para este batch'}`;
  if (views) details.push(views + '.');
  const aggregate = report.qualifiedLeadPercent == null ? '' : en
    ? `At the time of the report, ${report.qualifiedLeadPercent}% of Arturo’s live ads for this client were generating qualified leads, according to the client. This percentage describes the overall set, not this batch or individual video.`
    : `En la fecha del informe, el ${report.qualifiedLeadPercent}% de los anuncios activos de Arturo para este cliente generaba leads cualificados, según el cliente. Este porcentaje corresponde al conjunto, no a este batch ni a este video individual.`;
  return {
    label: batch.highlighted ? (en ? 'Client highlight' : 'Destacado por el cliente') : (en ? 'Client-reported results' : 'Resultados del cliente'),
    title: batch.name, attribution, details, views, aggregate,
    scope: en ? 'Client-reported batch results; no breakdown by individual version.' : 'Resultados del batch comunicados por el cliente, sin desglose por versión individual.',
    heading: en ? 'Client-reported results' : 'Resultados comunicados por el cliente',
    aggregateHeading: en ? 'Context for the overall set' : 'Contexto del conjunto',
  };
}
