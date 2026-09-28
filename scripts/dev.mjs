import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, extname, relative as relativePath } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { createApi } from '../server/api.mjs';
import { hashPassword } from '../server/auth.mjs';

const root = resolve('.');
const directory = resolve('scratch/dev-data');
await mkdir(directory, { recursive: true });
const password = process.env.DEV_PASSWORD || randomBytes(18).toString('base64url');
await writeFile('scratch/dev-password.txt', password, { mode: 0o600 });
const env = { ...process.env, ADMIN_PASSWORD_HASH: hashPassword(password), SESSION_SECRET: randomBytes(48).toString('hex') };
const filename = key => `${directory}/${Buffer.from(key).toString('base64url')}.json`;
const store = {
  async read(key) { try { return JSON.parse(await readFile(filename(key), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
  async write(key, data, etag = undefined) {
    const existing = await this.read(key);
    if (etag === null && existing || typeof etag === 'string' && etag !== existing?.etag) return false;
    const tmp = `${filename(key)}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify({ data, etag: randomUUID() }));
    await rename(tmp, filename(key));
    return true;
  },
  async remove(key) { const { rm } = await import('node:fs/promises'); await rm(filename(key), { force: true }); },
};
const api = createApi({ store, env });
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT) || 4173;
// Serial requests make the local storage adapter's compare-and-swap atomic.
let pending = Promise.resolve();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: req, duplex: 'half' } : {}) });
      const task = pending.then(() => api(request, { ip: 'local' }));
      pending = task.catch(() => {});
      const result = await task;
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    const path = resolve(root, relative.endsWith('/') ? `${relative}index.html` : relative);
    const normalized = relativePath(root, path);
    const allowed = ['index.html', 'style.css', 'app.js', 'catalog-view.mjs'].includes(normalized) || /^(admin|lib|assets)\//.test(normalized);
    if (!allowed || !path.startsWith(root + '/')) { res.writeHead(404); res.end(); return; }
    const info = await stat(path);
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    const data = await readFile(path);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const headers = { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start > end) { res.writeHead(416); res.end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
      res.end(data.subarray(start, end + 1));
    } else { res.writeHead(200, headers); res.end(data); }
  } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end('No disponible'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Panel local: http://127.0.0.1:${port}/admin/\nContraseña de prueba: scratch/dev-password.txt\nLos cambios locales no afectan al sitio publicado.`));
