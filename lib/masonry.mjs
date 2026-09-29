// One-pixel grid rows pack mixed ratios while preserving DOM and keyboard order.
export function masonryGrid(grid) {
  let enabled = false, frame = 0;
  const observed = new Set();
  function layout() {
    frame = 0;
    if (!enabled) return;
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 24;
    const spans = [...grid.children].map(card => [card, card.offsetHeight ? Math.ceil(card.offsetHeight + gap + 1) : 1]);
    for (const [card, span] of spans) {
      const value = `span ${span}`;
      if (card.style.gridRowEnd !== value) card.style.gridRowEnd = value;
    }
  }
  function schedule() { if (enabled && !frame) frame = requestAnimationFrame(layout); }
  const resize = new ResizeObserver(schedule);
  resize.observe(grid);
  function syncChildren() {
    for (const card of observed) if (card.parentNode !== grid) { resize.unobserve(card); observed.delete(card); }
    for (const card of grid.children) if (!observed.has(card)) { observed.add(card); resize.observe(card); }
    schedule();
  }
  const mutation = new MutationObserver(syncChildren);
  mutation.observe(grid, { childList: true, subtree: true });
  document.fonts?.ready.then(schedule);
  return {
    setActive(active) {
      enabled = active;
      grid.classList.toggle('masonry-layout', active);
      if (active) syncChildren();
      else {
        cancelAnimationFrame(frame); frame = 0;
        for (const card of grid.children) card.style.removeProperty('grid-row-end');
      }
    },
  };
}
