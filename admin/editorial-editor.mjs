import { briefLimits, suggestionSession } from '../lib/editorial.mjs';
const $ = id => document.getElementById(id);
const el = (tag, text, cls = '') => { const n = document.createElement(tag); n.textContent = text; n.className = cls; return n; };
export const readBrief = () => Object.fromEntries(Object.keys(briefLimits).map(key => [key, $(`brief-${key}`).value.trim()]));

export function editorialEditor(item, request, onApply) {
  let disposed = false;
  for (const key of Object.keys(briefLimits)) $(`brief-${key}`).value = item?.editorial?.[key] || '';
  const button = $('suggest-editorial'), status = $('editorial-status'), options = $('editorial-options');
  button.disabled = false; status.textContent = ''; options.replaceChildren();
  $('editorial-panel').open = !item?.title;
  const session = suggestionSession(() => ({ brief: readBrief(), currentTitle: $('project-title').value, currentDescription: $('project-description').value }), option => {
    $('project-title').value = option.title; $('project-description').value = option.description;
    onApply(); options.replaceChildren(); status.textContent = 'Propuesta aplicada. Puedes editarla; guarda el proyecto cuando esté listo.';
  });
  button.onclick = async () => {
    if (!readBrief().subject || !readBrief().contribution) {
      status.textContent = 'Completa el tema o producto y tu aportación real.';
      (!readBrief().subject ? $('brief-subject') : $('brief-contribution')).focus(); return;
    }
    button.disabled = true; options.replaceChildren(); status.textContent = 'Preparando tres propuestas…';
    try {
      const result = await session.generate(request);
      if (disposed) return;
      if (!result) { status.textContent = 'El texto cambió mientras se generaban las propuestas. Vuelve a pedirlas con la ficha actualizada.'; return; }
      const angles = ['Directo', 'Concepto creativo', 'Aportación profesional'];
      result.options.forEach((option, index) => {
        const box = el('article', '', 'editorial-option');
        if (result.recommended === index) box.classList.add('recommended');
        box.append(el('p', `${angles[index]}${result.recommended === index ? ' · Recomendada' : ''}`, 'eyebrow'), el('h4', option.title), el('p', option.description), el('p', option.reason, 'field-help'));
        const use = el('button', 'Usar esta opción', 'secondary'); use.type = 'button';
        use.onclick = () => {
          if (!session.use(index)) { options.replaceChildren(); status.textContent = 'La ficha o los textos cambiaron. Genera nuevas propuestas antes de aplicar una.'; }
        };
        box.append(use); options.append(box);
      });
      status.textContent = result.missingInfo.length ? `Para afinar: ${result.missingInfo.join(' ')}` : 'Elige una opción y revisa que describa fielmente tu trabajo.';
    } catch (e) { if (!disposed) status.textContent = e.message; }
    finally { if (!disposed) button.disabled = false; }
  };
  return { dispose() { disposed = true; session.dispose(); button.onclick = null; } };
}
