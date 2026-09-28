import { mkdir, rm, cp } from 'node:fs/promises';
// Publish an explicit allowlist: no server source, secrets, backups or originals outside assets.
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'style.css', 'app.js', 'catalog-view.mjs', 'assets', 'admin', 'lib']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
console.log('Sitio y panel preparados en dist/.');
