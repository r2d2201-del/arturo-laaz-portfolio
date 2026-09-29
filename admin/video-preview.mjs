export function clipBounds(start, duration) {
  const known = Number.isFinite(duration) && duration > 0;
  const max = known ? Math.min(36000, Math.max(0, Math.floor((duration - 5) * 10) / 10)) : 36000;
  const value = Math.min(max, Math.max(0, Math.round((Number(start) || 0) * 10) / 10));
  return { start: value, end: known ? Math.min(duration, value + 5) : value + 5, max, known };
}

export function clipTime(seconds) {
  const ticks = Math.max(0, Math.round((Number(seconds) || 0) * 10));
  return `${Math.floor(ticks / 600)}:${String(Math.floor(ticks % 600 / 10)).padStart(2, '0')}.${ticks % 10}`;
}

export function sourceClipStart(source) {
  return Number(source?.preview?.match(/(?:\/|,)so_(\d+(?:\.\d+)?)(?:,|\/)/)?.[1] || 0);
}

export function videoPreview(root, onChange) {
  const find = id => root.querySelector(`#${id}`);
  const video = find('video-player'), range = find('preview-range'), number = find('preview-start');
  const message = find('video-player-message'), selection = find('preview-window');
  const useFrame = find('preview-use-frame'), play = find('preview-play');
  let duration = NaN, start = 0, objectUrl = null, editable = true, locked = false, playingSelection = false;

  function render() {
    const bounds = clipBounds(start, duration);
    number.value = start; number.max = bounds.max;
    range.value = start; range.max = bounds.max;
    number.disabled = locked || !editable;
    range.disabled = locked || !editable || !bounds.known || bounds.max === 0;
    useFrame.disabled = locked || !editable || !bounds.known;
    play.disabled = !bounds.known;
    range.setAttribute('aria-valuetext', `Desde ${clipTime(start)} hasta ${clipTime(bounds.end)}`);
    find('preview-interval').textContent = `${clipTime(start)} — ${clipTime(bounds.end)}`;
    find('preview-length').textContent = `${(bounds.end - start).toFixed(1)} s`;
    find('preview-total').textContent = bounds.known ? clipTime(duration) : '—';
    selection.style.left = `${bounds.known ? start / duration * 100 : 0}%`;
    selection.style.width = `${bounds.known ? (bounds.end - start) / duration * 100 : 100}%`;
    play.textContent = playingSelection ? 'Pausar selección' : '▶ Ver selección';
  }
  function pause() { playingSelection = false; video.pause(); render(); }
  function setStart(value, seek = true) {
    const next = clipBounds(value, duration).start;
    const changed = next !== start;
    pause(); start = next; render();
    if (seek && Number.isFinite(duration)) video.currentTime = start;
    if (changed) onChange(start);
  }
  range.addEventListener('input', () => setStart(range.value));
  number.addEventListener('change', () => setStart(number.value));
  useFrame.onclick = () => setStart(video.currentTime);
  play.onclick = async () => {
    if (playingSelection) { pause(); return; }
    video.pause(); video.currentTime = start; video.muted = true;
    playingSelection = true; render();
    try { await video.play(); } catch { pause(); message.textContent = 'Pulsa reproducir en el video para verlo.'; }
  };
  video.addEventListener('loadedmetadata', () => {
    duration = video.duration;
    message.textContent = editable
      ? 'Mueve el selector o pausa el video y elige «Empezar aquí». La portada usará ese fotograma.'
      : 'Puedes reproducir este video. Para cambiar su fragmento, vuelve a subir el archivo original.';
    setStart(start);
  });
  video.addEventListener('error', () => {
    duration = NaN; render();
    message.textContent = objectUrl
      ? 'Este formato no se puede reproducir aquí todavía. Pulsa «Preparar video» para convertirlo; después podrás elegir el fragmento visualmente.'
      : 'No se pudo reproducir el video. Comprueba la conexión y vuelve a abrir el proyecto.';
  });
  video.addEventListener('timeupdate', () => {
    if (playingSelection && video.currentTime >= clipBounds(start, duration).end) pause();
  });
  video.addEventListener('seeking', () => {
    if (playingSelection && (video.currentTime < start - 0.1 || video.currentTime > clipBounds(start, duration).end + 0.1)) {
      playingSelection = false; render();
    }
  });
  video.addEventListener('pause', () => { if (video.paused) { playingSelection = false; render(); } });
  video.addEventListener('ended', () => { playingSelection = false; render(); });
  function reset() {
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; duration = NaN; start = 0; locked = false; editable = true; playingSelection = false;
    root.hidden = true; message.textContent = ''; render();
  }
  return {
    load(input, options = {}) {
      reset(); start = options.start || 0; editable = options.editable !== false;
      root.hidden = false;
      if (options.poster) video.poster = options.poster;
      const url = input instanceof Blob ? (objectUrl = URL.createObjectURL(input)) : new URL(input, location.origin).href;
      video.src = url; message.textContent = 'Cargando el reproductor…'; render();
    },
    get start() { return start; },
    get duration() { return duration; },
    setLocked(value) { locked = value; if (value) pause(); render(); },
    pause, reset,
  };
}
