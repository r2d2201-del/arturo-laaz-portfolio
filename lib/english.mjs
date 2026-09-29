export function englishField(base, value = '', metadata) {
  return { base: base.trim(), value, source: metadata?.source ?? '', automatic: metadata?.automatic ?? '', custom: metadata?.custom ?? Boolean(value.trim()) };
}
export function changeEnglishSource(field, text) {
  field.base = text.trim();
}
export function settleEmptyEnglish(field) {
  if (!field.base) Object.assign(field, { value: '', source: '', automatic: '', custom: false });
}
export function editEnglish(field, text) { field.value = text; field.custom = Boolean(text.trim()); }
export function applyEnglish(field, requestedSource, translated) {
  if (field.base !== requestedSource) return false;
  field.source = requestedSource; field.automatic = translated;
  if (!field.custom) field.value = translated;
  return true;
}
export function useAutomaticEnglish(field) { field.custom = false; if (field.base === field.source) field.value = field.automatic; }
export function englishMetadata(field) { return { source: field.source, automatic: field.automatic, custom: field.custom }; }
export function needsEnglish(field) { return Boolean(field.base) && (field.base !== field.source || !field.automatic); }
