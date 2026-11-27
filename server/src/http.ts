import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Req extends IncomingMessage {
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  ip?: string;
}
export type Handler = (req: Req, res: ServerResponse) => unknown | Promise<unknown>;

interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }
const routes: Route[] = [];

export function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = [];
  const re = new RegExp(`^${pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  routes.push({ method, re, keys, handler });
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

export function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

export async function readBody(req: IncomingMessage, limit = 2 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req);
  if (!buf.length) return {} as T;
  try {
    return JSON.parse(buf.toString('utf8')) as T;
  } catch {
    throw new HttpError(400, 'Некорректный JSON');
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.map': 'application/json',
};

export function sendFile(res: ServerResponse, file: string, opts: { mime?: string; download?: string; cache?: boolean } = {}) {
  const st = statSync(file);
  const headers: Record<string, string | number> = {
    'Content-Type': opts.mime ?? MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': opts.cache ? 'public, max-age=31536000, immutable' : 'no-store',
  };
  if (opts.download) headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

export function sendBuffer(res: ServerResponse, buf: Buffer, opts: { mime: string; download?: string; cacheSeconds?: number }) {
  const cache = opts.cacheSeconds ? `private, max-age=${opts.cacheSeconds}, immutable` : 'no-store';
  const headers: Record<string, string | number> = { 'Content-Type': opts.mime, 'Content-Length': buf.length, 'Cache-Control': cache };
  if (opts.download) headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
  res.writeHead(200, headers);
  res.end(buf);
}

/** Раздача собранного фронтенда (dist/) с SPA-fallback на index.html. */
export function serveStatic(distDir: string, req: Req, res: ServerResponse): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const safe = normalize(decodeURIComponent(req.path)).replace(/^(\.\.[/\\])+/, '');
  let file = resolve(join(distDir, safe));
  if (!file.startsWith(distDir)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(distDir, 'index.html');
  if (!existsSync(file)) return false;
  sendFile(res, file, { cache: req.path.startsWith('/assets/') });
  return true;
}

export async function dispatch(req: Req, res: ServerResponse): Promise<boolean> {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = req.path.match(r.re);
    if (!m) continue;
    req.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      await r.handler(req, res);
    } catch (e) {
      if (e instanceof HttpError) json(res, e.status, { error: e.message, details: e.details });
      else {
        console.error('[api]', req.method, req.path, e);
        json(res, 500, { error: 'Внутренняя ошибка сервера' });
      }
    }
    return true;
  }
  return false;
}
