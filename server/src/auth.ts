import { timingSafeEqual } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { config } from './config';
import { HttpError, json, readJson, route, type Req } from './http';
import { audit, signToken, verifyToken } from './security';

// Вход по общему паролю клиники (APP_PASSWORD). Если пароль не задан — вход не нужен
// (локальный запуск на компьютере клиники работает как раньше).

const COOKIE = 'dermemr_session';
const TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней

/** Без входа доступны: проверка сервера, справочники, вход, страницы для пациента и смартфона, ссылки с подписью. */
const PUBLIC: RegExp[] = [
  /^\/api\/v1\/(health|config|dictionaries)$/,
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/portal\//, // личный кабинет пациента (случайный id)
  /^\/api\/v1\/m\/session$/, /^\/api\/v1\/media\/mobile-upload$/, /^\/m\/upload$/, // смартфон по QR (подписанный токен)
  /^\/media\//, /^\/api\/v1\/documents\/[^/]+\/file$/, // файлы по подписанной временной ссылке
  /^\/verify\//, /^\/webhooks\//,
];

function cookieValue(req: Req): string {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}

export const isLoggedIn = (req: Req) => !config.appPassword || !!verifyToken<{ s: string }>(cookieValue(req));

const needsAuth = (path: string) => (path.startsWith('/api/') || path.startsWith('/media/')) && !PUBLIC.some((re) => re.test(path));

/** true — запрос можно обрабатывать; false — ответ 401 уже отправлен. */
export function guard(req: Req, res: ServerResponse): boolean {
  if (!config.appPassword || !needsAuth(req.path) || isLoggedIn(req)) return true;
  json(res, 401, { error: 'Нужно войти', auth: true });
  return false;
}

function setCookie(req: Req, res: ServerResponse, value: string, maxAgeSec: number) {
  const secure = config.vercel || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function registerAuthRoutes() {
  route('GET', '/api/v1/auth/status', (req, res) => json(res, 200, { required: !!config.appPassword, loggedIn: isLoggedIn(req) }));

  route('POST', '/api/v1/auth/login', async (req, res) => {
    const b = await readJson<{ password?: string }>(req);
    if (!config.appPassword) return json(res, 200, { ok: true });
    if (!sameText(String(b.password ?? ''), config.appPassword)) {
      await new Promise((r) => setTimeout(r, 800)); // замедляем перебор
      audit('LOGIN_FAILED', null, req.ip, 'staff');
      throw new HttpError(401, 'Неверный пароль');
    }
    setCookie(req, res, signToken({ s: 'staff' }, TTL), TTL / 1000);
    audit('LOGIN', null, req.ip, 'staff');
    json(res, 200, { ok: true });
  });

  route('POST', '/api/v1/auth/logout', (req, res) => {
    setCookie(req, res, '', 0);
    json(res, 200, { ok: true });
  });
}
