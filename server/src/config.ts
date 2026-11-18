import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

// Корень проекта: server/dist/server.mjs → ../../
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Минимальный загрузчик .env (KEY=VALUE, # комментарии) без зависимостей. */
function loadEnv() {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnv();

const env = (k: string, def = '') => (process.env[k] ?? def).trim();

export function lanIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
  }
  return null;
}

const PORT = Number(env('PORT', '3000'));
const DATA_DIR = resolve(ROOT, env('DATA_DIR', 'storage'));
mkdirSync(resolve(DATA_DIR, 'media'), { recursive: true });
mkdirSync(resolve(DATA_DIR, 'documents'), { recursive: true });

function secret(): string {
  const fromEnv = env('APP_SECRET');
  if (fromEnv) return fromEnv;
  const f = resolve(DATA_DIR, 'secret.key');
  if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString('hex'));
  return readFileSync(f, 'utf8').trim();
}

export const config = {
  port: PORT,
  host: env('HOST', '0.0.0.0'),
  dataDir: DATA_DIR,
  distDir: resolve(ROOT, 'dist'),
  /** Адрес, по которому клинику видят смартфоны и пациенты (QR, /verify). */
  publicUrl: env('PUBLIC_URL') || `http://${lanIp() ?? 'localhost'}:${PORT}`,
  secret: secret(),
  openBrowser: env('OPEN_BROWSER', '1') !== '0',
  pdfBrowserPath: env('PDF_BROWSER_PATH'),
  bookingUrl: env('BOOKING_URL', 'https://clinic.example/booking'),
  telegram: { token: env('TELEGRAM_BOT_TOKEN') },
  whatsapp: {
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    template: env('WHATSAPP_TEMPLATE', 'dermatology_visit_summary'),
    language: env('WHATSAPP_TEMPLATE_LANG', 'ru'),
    verifyToken: env('WHATSAPP_VERIFY_TOKEN', 'dermemr'),
    apiVersion: env('WHATSAPP_API_VERSION', 'v21.0'),
  },
  max: { token: env('MAX_BOT_TOKEN'), apiUrl: env('MAX_API_URL', 'https://platform-api.max.ru') },
  mediaTtlMs: 15 * 60 * 1000,
  qrTtlMs: 15 * 60 * 1000,
};
