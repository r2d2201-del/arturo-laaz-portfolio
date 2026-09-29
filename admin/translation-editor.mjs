import { englishField, changeEnglishSource, settleEmptyEnglish, editEnglish, applyEnglish, useAutomaticEnglish, englishMetadata, needsEnglish } from '../lib/english.mjs';

// A controller per dialog: late responses cannot reach a different project or erase manual edits.
export function translationEditor(fields, metadata, translate) {
  let timer, inFlight, disposed = false, lastError = '', loading = false;
  const states = fields.map(f => englishField(f.source.value, f.target.value, metadata?.[f.key]));
  function paint() {
    fields.forEach((f, i) => {
      const state = states[i];
      f.target.value = state.value;
      f.reset.hidden = !state.custom && !lastError;
      f.reset.textContent = lastError ? 'Reintentar' : 'Usar traducción automática';
      f.status.classList.toggle('translation-error', Boolean(lastError));
      f.status.textContent = !state.base ? 'Se genera al escribir el texto original.' : loading && needsEnglish(state) ? 'Generando inglés…' : lastError && needsEnglish(state) ? lastError : state.custom ? (needsEnglish(state) ? 'Tu versión se conserva. La sugerencia automática se actualizará.' : 'Versión personalizada. Puedes volver a la traducción automática.') : needsEnglish(state) ? 'Se traducirá automáticamente…' : 'Traducción automática · Puedes editarla.';
    });
  }
  async function ensure() {
    clearTimeout(timer);
    if (inFlight) { await inFlight; if (!disposed && states.some(needsEnglish)) return ensure(); return; }
    if (disposed) return;
    fields.forEach((f, i) => { changeEnglishSource(states[i], f.source.value); settleEmptyEnglish(states[i]); });
    const pending = states.map((s, i) => ({ id: String(i), kind: fields[i].key, text: s.base })).filter(x => needsEnglish(states[Number(x.id)]));
    if (!pending.length) {
      states.forEach(state => { if (!state.custom) state.value = state.automatic; }); paint(); return;
    }
    loading = true; lastError = ''; paint();
    inFlight = (async () => {
      try {
        const result = await translate(pending);
        if (disposed) return;
        for (const requested of pending) {
          const translated = result.translations.find(x => x.id === requested.id)?.text;
          if (typeof translated !== 'string') throw new Error('No se pudo generar el inglés. Pulsa Reintentar.');
          applyEnglish(states[Number(requested.id)], requested.text, translated);
        }
      } catch (e) { lastError = e.message; throw e; }
      finally { loading = false; if (!disposed) paint(); }
    })();
    try { await inFlight; } finally { inFlight = null; }
    if (!disposed && states.some(needsEnglish)) return ensure();
  }
  function schedule() {
    if (disposed) return;
    clearTimeout(timer);
    fields.forEach((f, i) => changeEnglishSource(states[i], f.source.value));
    lastError = ''; paint();
    timer = setTimeout(() => ensure().catch(() => {}), 1000);
  }
  const listeners = [];
  fields.forEach((f, i) => {
    const onEdit = () => { editEnglish(states[i], f.target.value); lastError = ''; paint(); };
    const onReset = () => { if (!lastError) useAutomaticEnglish(states[i]); lastError = ''; paint(); ensure().catch(() => {}); };
    f.source.addEventListener('input', schedule); f.target.addEventListener('input', onEdit); f.reset.addEventListener('click', onReset);
    listeners.push(() => { f.source.removeEventListener('input', schedule); f.target.removeEventListener('input', onEdit); f.reset.removeEventListener('click', onReset); });
  });
  schedule();
  return {
    ensure, schedule,
    async ensureForSave() {
      try { await ensure(); }
      catch (error) { if (!states.every(state => !state.base || state.custom && state.value.trim())) throw error; }
    },
    metadata: () => Object.fromEntries(fields.map((f, i) => [f.key, englishMetadata(states[i])])),
    dispose() { disposed = true; clearTimeout(timer); listeners.forEach(fn => fn()); },
  };
}
