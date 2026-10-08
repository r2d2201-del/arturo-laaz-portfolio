import { setTimeout as delay } from 'node:timers/promises';

// One retry, within the caller's original deadline. Never retry quota/auth/schema
// failures, or ignore a Retry-After that is too long for an interactive request.
export async function fetchAi(fetcher, url, options, wait = delay) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try { response = await fetcher(url, options); }
    catch {
      if (attempt || options.signal.aborted) throw Object.assign(new Error('No se pudo conectar con el servicio de IA. Tus textos se conservan; vuelve a intentarlo en un momento.'), { status: 503, code: 'ai_connection_failed' });
    }
    if (response) {
      if (attempt || ![429, 500, 502, 503, 504].includes(response.status)) return response;
      if (response.status === 429) {
        const body = await response.clone().json().catch(() => null);
        if (body?.error?.code === 'insufficient_quota' || body?.error?.type === 'insufficient_quota') return response;
      }
    }
    const retryAfter = response?.headers.get('retry-after');
    const waitMs = retryAfter === null || retryAfter === undefined ? 1000 : /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
    if (!Number.isFinite(waitMs) || waitMs > 2000 || options.signal.aborted) return response;
    await response?.body?.cancel();
    try { await wait(Math.max(0, waitMs), undefined, { signal: options.signal }); }
    catch { throw Object.assign(new Error('El servicio de IA tardó demasiado. Tus textos se conservan; vuelve a intentarlo en un momento.'), { status: 503, code: 'ai_timeout' }); }
  }
}
