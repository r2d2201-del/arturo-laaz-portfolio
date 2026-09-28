import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { hashPassword } from '../server/auth.mjs';
const password = randomBytes(24).toString('base64url');
const secret = randomBytes(48).toString('base64url');
await mkdir('scratch', { recursive: true });
const path = `scratch/admin-access-${Date.now()}.txt`;
await writeFile(path, `Contraseña del panel (guárdala en tu gestor de contraseñas):\n${password}\n\nVariables de entorno de Netlify:\nADMIN_PASSWORD_HASH=${hashPassword(password)}\nSESSION_SECRET=${secret}\n`, { mode: 0o600, flag: 'wx' });
console.log(`Credenciales generadas en ${path}. Este archivo no se publica ni se incluye en Git.`);
