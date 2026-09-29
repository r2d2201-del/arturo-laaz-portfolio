export function metricsText(metrics, lang = 'es') {
  const en = lang === 'en';
  const locale = en ? 'en-US' : 'es-EC';
  const labels = en ? ['Views', 'Likes', 'Comments'] : ['Visualizaciones', 'Likes', 'Comentarios'];
  const unavailable = en ? 'Not available' : 'No disponible';
  const fields = ['viewCount', 'likeCount', 'commentCount'];
  const values = fields.map((key, i) => {
    const raw = metrics?.[key];
    const number = typeof raw === 'string' && /^\d{1,20}$/.test(raw) ? BigInt(raw) : null;
    return { label: labels[i], value: number === null ? '—' : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(number), full: number === null ? unavailable : new Intl.NumberFormat(locale).format(number) };
  });
  let status = en ? 'YouTube · Metrics unavailable' : 'YouTube · Métricas no disponibles';
  if (metrics?.status === 'loading') status = en ? 'YouTube · Loading metrics…' : 'YouTube · Consultando métricas…';
  if (metrics?.status === 'available' && metrics.updatedAt) {
    const date = new Date(metrics.updatedAt);
    if (Number.isFinite(date.getTime())) status = `${metrics.stale ? (en ? 'YouTube · Last available data' : 'YouTube · Últimos datos disponibles') : (en ? 'YouTube · Updated' : 'YouTube · Actualizado')} ${date.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}`;
  }
  return { values, status };
}
