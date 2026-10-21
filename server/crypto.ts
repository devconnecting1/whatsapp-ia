import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { SECRET_FILE } from './config';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (fs.existsSync(SECRET_FILE)) {
    cachedKey = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex');
    if (cachedKey.length === 32) return cachedKey;
  }
  cachedKey = randomBytes(32);
  fs.writeFileSync(SECRET_FILE, cachedKey.toString('hex'), { mode: 0o600 });
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(value: string): string | null {
  try {
    const [ivPart, tagPart, dataPart] = value.split('.');
    if (!ivPart || !tagPart || !dataPart) return null;
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

export function hintForSecret(secret: string): string {
  const tail = secret.slice(-4);
  return tail ? `•••• ${tail}` : 'configurada';
}
