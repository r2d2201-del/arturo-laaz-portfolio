import { getStore } from '@netlify/blobs';
import { createApi } from '../../server/api.mjs';

function storage() {
  const blob = getStore({ name: 'portfolio-cms-v1', consistency: 'strong' });
  return {
    read: key => blob.getWithMetadata(key, { type: 'json', consistency: 'strong' }),
    async write(key, data, etag = undefined) {
      const options = etag === null ? { onlyIfNew: true } : etag ? { onlyIfMatch: etag } : {};
      const result = await blob.setJSON(key, data, options);
      return result.modified;
    },
    remove: key => blob.delete(key),
  };
}
export default async (req, context) => createApi({ store: storage() })(req, { ip: context.ip });
export const config = { path: '/api/*', rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
