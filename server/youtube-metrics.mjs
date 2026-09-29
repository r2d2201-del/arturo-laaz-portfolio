import { randomUUID } from 'node:crypto';
import { YOUTUBE_ID } from '../lib/catalog.mjs';

const CACHE_KEY = 'youtube-metrics/v1';
const HOUR = 3_600_000;
const MAX_AGE = 24 * HOUR;
const count = value => typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : null;
export const youtubeMetricsConfigured = env => Boolean(env.YOUTUBE_API_KEY?.trim());

// IDs come from the selected catalog, never from a public query parameter.
export async function youtubeMetrics(catalog, { store, env, fetcher = fetch, now = Date.now() }) {
  const ids = [...new Set(catalog.items.filter(item => item.visible && item.source.type === 'youtube' && item.showYoutubeMetrics === true).map(item => item.source.youtubeId))].filter(id => YOUTUBE_ID.test(id));
  if (!youtubeMetricsConfigured(env)) return { items: ids.map(id => ({ id, status: 'unconfigured' })) };
  if (!ids.length) return { items: [] };
  let cached = await store.read(CACHE_KEY);
  let entries = cached?.data.entries || {};
  const pending = ids.filter(id => !entries[id] || entries[id].retryAt <= now);
  // A short lease prevents visitors in different function instances spending quota together.
  if (pending.length && !(cached?.data.leaseUntil > now)) {
    const lease = randomUUID();
    const acquired = await store.write(CACHE_KEY, { entries, lease, leaseUntil: now + 30_000 }, cached?.etag || null);
    if (acquired) {
      entries = Object.fromEntries(Object.entries(entries).filter(([, entry]) => entry.checkedAt > now - MAX_AGE));
      const batches = [];
      for (let i = 0; i < pending.length; i += 50) batches.push(pending.slice(i, i + 50));
      await Promise.all(batches.map(async batch => {
        try {
          const url = new URL('https://www.googleapis.com/youtube/v3/videos');
          url.search = new URLSearchParams({ part: 'statistics', id: batch.join(','), fields: 'items(id,statistics)' }).toString();
          const response = await fetcher(url.toString(), { headers: { 'X-Goog-Api-Key': env.YOUTUBE_API_KEY }, signal: AbortSignal.timeout(7000) });
          if (!response.ok) throw new Error('YouTube statistics unavailable');
          const result = await response.json();
          if (!Array.isArray(result.items)) throw new Error('Invalid YouTube statistics');
          for (const id of batch) {
            const item = result.items.find(item => item.id === id);
            const statistics = item?.statistics;
            const counts = { viewCount: count(statistics?.viewCount), likeCount: count(statistics?.likeCount), commentCount: count(statistics?.commentCount) };
            entries[id] = { status: item && Object.values(counts).some(value => value !== null) ? 'available' : 'unavailable', ...counts, checkedAt: now, updatedAt: now, retryAt: now + HOUR };
          }
        } catch {
          // Keep the last real values briefly on failure, never replace missing values with zero.
          for (const id of batch) entries[id] = { ...(entries[id] || { status: 'error' }), checkedAt: now, retryAt: now + 300_000 };
        }
      }));
      cached = await store.read(CACHE_KEY);
      if (cached?.data.lease === lease) await store.write(CACHE_KEY, { entries, leaseUntil: 0 }, cached.etag);
    }
  }
  return { items: ids.map(id => {
    const entry = entries[id];
    if (!entry || !entry.updatedAt || now - entry.updatedAt >= MAX_AGE) return { id, status: entry?.status === 'unavailable' ? 'unavailable' : 'error' };
    return { id, status: entry.status, viewCount: entry.viewCount, likeCount: entry.likeCount, commentCount: entry.commentCount, updatedAt: new Date(entry.updatedAt).toISOString(), stale: now - entry.updatedAt >= HOUR };
  }) };
}
