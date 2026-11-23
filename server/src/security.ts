import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const hmac = (s: string) => createHmac('sha256', config.secret).update(s).digest('base64url').slice(0, 22);

export const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString('hex')}`;

/** Подписанный токен с TTL (аналог одноразового JWT из SPEC §3.2, компактный для QR). */
export function signToken(payload: Record<string, string | number>, ttlMs: number): string {
  const body = b64u(JSON.stringify({ ...payload, x: Date.now() + ttlMs }));
  return `${body}.${hmac(body)}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string): (T & { x: number }) | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { x: number };
  return data.x > Date.now() ? data : null;
}

/** Presigned URL для медиа и PDF (SPEC §7.2: временные ссылки на 15 минут). */
export function presign(path: string, ttlMs = config.mediaTtlMs): string {
  const exp = Date.now() + ttlMs;
  return `${path}?exp=${exp}&sig=${hmac(`${path}:${exp}`)}`;
}

export function checkPresigned(path: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return hmac(`${path}:${exp}`) === sig;
}

/** Неизменяемый журнал аудита (append-only JSONL). */
export function audit(action: string, entityId: string | null, ip: string | undefined, userId = 'doctor_demo') {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), user_id: userId, action, entity_id: entityId, ip_address: ip ?? null });
  if (config.vercel) return console.log('[audit]', line); // журнал функций Vercel
  appendFileSync(resolve(config.dataDir, 'audit.log'), `${line}\n`);
}
