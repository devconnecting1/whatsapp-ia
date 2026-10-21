import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
export const AUTH_DIR = path.join(DATA_DIR, 'auth');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const MESSAGES_DIR = path.join(DATA_DIR, 'messages');
export const DB_FILE = path.join(DATA_DIR, 'db.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const SECRET_FILE = path.join(DATA_DIR, '.secret');

export const PORT = Number(process.env.PORT || 3333);
export const HOST = '127.0.0.1';
export const IS_PROD = process.env.NODE_ENV === 'production';
export const SYNC_FULL_HISTORY = process.env.SYNC_FULL_HISTORY !== 'false';

for (const dir of [DATA_DIR, MEDIA_DIR, MESSAGES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
