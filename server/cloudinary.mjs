import { createHash, randomUUID } from 'node:crypto';

export function cloudConfigured(env) {
  return Boolean(/^[a-z0-9_-]+$/i.test(env.CLOUDINARY_CLOUD_NAME || '') && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}
export function signParameters(params, secret) {
  return createHash('sha1').update(Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + secret).digest('hex');
}
export function transforms(start = 0) {
  return [
    'c_limit,w_1920,h_1920,q_auto:good,vc_h264,ac_aac,f_mp4',
    `c_limit,w_640,h_640,q_auto:good,vc_h264,ac_none,so_${start},du_5,f_mp4`,
    `c_limit,w_900,h_900,so_${start},f_jpg`,
  ];
}
export function uploadTicket(env, start = 0) {
  const id = randomUUID();
  const publicId = `arturo-portfolio/${id}`;
  const params = {
    timestamp: Math.floor(Date.now() / 1000), public_id: publicId,
    overwrite: 'false', eager: transforms(start).join('|'), eager_async: 'true',
  };
  return {
    id, publicId, start, createdAt: Date.now(),
    upload: {
      url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/video/upload`,
      fields: { ...params, signature: signParameters(params, env.CLOUDINARY_API_SECRET), api_key: env.CLOUDINARY_API_KEY },
    },
  };
}
export async function preparePreview(record, start, env, fetcher = fetch) {
  const params = {
    timestamp: Math.floor(Date.now() / 1000), public_id: record.publicId, type: 'upload',
    eager: transforms(start).slice(1).join('|'), eager_async: 'true',
  };
  const response = await fetcher(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/video/explicit`, {
    method: 'POST', body: new URLSearchParams({ ...params, signature: signParameters(params, env.CLOUDINARY_API_SECRET), api_key: env.CLOUDINARY_API_KEY }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('No se pudo preparar el nuevo fragmento. Intenta nuevamente.');
  // Keep the old upload record immutable so published projects and history stay valid.
  return { id: randomUUID(), publicId: record.publicId, start, size: record.size, createdAt: Date.now() };
}
export async function inspectUpload(record, env, fetcher = fetch) {
  // Cloudinary only includes video duration when media metadata is requested.
  const base = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/video/upload/${encodeURIComponent(record.publicId)}?media_metadata=true`;
  const response = await fetcher(base, {
    headers: { Authorization: `Basic ${Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64')}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { status: 'uploading' };
  if (!response.ok) throw new Error('No se pudo comprobar el video en Cloudinary. Intenta de nuevo.');
  const asset = await response.json();
  if (asset.public_id !== record.publicId || asset.resource_type !== 'video' || !asset.duration || !asset.width || !asset.height || !Number.isSafeInteger(asset.version)) throw new Error('El archivo recibido no es un video válido.');
  if (record.start >= asset.duration) throw new Error('El inicio de la vista previa está fuera de la duración del video.');
  if (asset.bytes > (Number(env.MAX_UPLOAD_MB) || 100) * 1024 ** 2) throw new Error('El archivo recibido supera el máximo configurado.');
  const urls = transforms(record.start).map((t, i) => `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/video/upload/${t}/v${asset.version}/${record.publicId}.${i === 2 ? 'jpg' : 'mp4'}`);
  const results = await Promise.all(urls.map(url => fetcher(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })));
  if (results.some(x => !x.ok && ![404, 423].includes(x.status))) throw new Error('No se pudo generar una de las versiones del video. Revisa el límite de tu cuenta.');
  if (results.some(x => !x.ok)) return { status: 'processing' };
  return {
    status: 'ready', duration: asset.duration,
    aspect: asset.width > asset.height ? 'landscape' : asset.width === asset.height ? 'square' : 'portrait',
    source: { type: 'video', youtubeId: '', url: urls[0], preview: urls[1], poster: urls[2], assetId: record.id },
  };
}
