// Точка входа для Vercel (облачная версия). Тот же набор маршрутов, что и у локального сервера,
// но данные хранятся в Vercel Blob (private): база — один JSON-файл с проверкой версии (ETag),
// снимки и документы — отдельные файлы. Локальный запуск (main.ts) этот файл не использует.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { get, head, put } from '@vercel/blob';
import { config } from './config';
import type { DbShape } from './db';
import { requestContext, type RequestContext } from './context';
import { seedDb } from './seed';
import { dispatch, json, readBody, type Req } from './http';
import { applyStoredDictionaries, registerRoutes } from './routes';
import { registerDayHospitalRoutes } from './dayHospital';
import { guard, registerAuthRoutes } from './auth';
import { setFileStore, type FileKind } from './storage';

registerRoutes();
registerDayHospitalRoutes();
registerAuthRoutes();

const DB_PATH = 'db/db.json';
const REQUEST_TIMEOUT_MS = 25000;
const MAX_EVENTS = 300;

// Обращение к Blob не должно подвешивать запрос: ограничиваем время каждой операции
const BLOB_TIMEOUT_MS = 12000;
const signal = () => AbortSignal.timeout(BLOB_TIMEOUT_MS);

const toBuffer = async (stream: ReadableStream<Uint8Array>) => Buffer.from(await new Response(stream).arrayBuffer());
const isPrecondition = (e: unknown) => /precondition/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`);

setFileStore({
  async put(kind: FileKind, name: string, buf: Buffer, mime: string) {
    await put(`${kind}/${name}`, buf, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: mime, abortSignal: signal() });
  },
  async get(kind: FileKind, name: string) {
    const r = await get(`${kind}/${name}`, { access: 'private', abortSignal: signal() });
    return r && r.statusCode === 200 && r.stream ? toBuffer(r.stream) : null;
  },
});

// ---------- база: чтение с проверкой версии, запись только если никто не изменил её раньше ----------
// Чтения из Blob платные по количеству (Hobby: 10 000 в месяц), поэтому GET-запросы несколько секунд
// пользуются уже прочитанной копией. Запись всегда сверяет версию (ifMatch), так что устаревшая копия
// не может затереть чужие изменения.
const READ_TTL_MS = 4000;
let cache: { json: string; etag: string; checkedAt: number } | null = null;

async function seedRemote(): Promise<void> {
  const data = seedDb(); // копирует демо-снимки в /tmp/dermemr/media
  for (const m of data.media) {
    const f = resolve(config.dataDir, 'media', m.file);
    if (existsSync(f)) await put(`media/${m.file}`, readFileSync(f), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: m.mime });
  }
  try {
    await put(DB_PATH, JSON.stringify(data), { access: 'private', allowOverwrite: false, addRandomSuffix: false, contentType: 'application/json' });
  } catch (e) {
    console.warn('[db] seed skipped:', (e as Error).message); // базу уже создал другой экземпляр
  }
}

const isNotFound = (e: unknown) => /not.?found/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`);

// Версию базы берём из head(): только этот ETag принимает put(..., { ifMatch }).
// ETag из ответа get() приходит через CDN в другом виде — из-за этого раньше ни одна запись
// не проходила проверку версии (ошибка «Данные одновременно изменили на другом компьютере»).
async function remoteEtag(): Promise<string> {
  try {
    return (await head(DB_PATH, { abortSignal: signal() })).etag;
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await seedRemote();
    return (await head(DB_PATH, { abortSignal: signal() })).etag;
  }
}

async function loadRemote(readOnly: boolean): Promise<{ json: string; etag: string }> {
  if (readOnly && cache && Date.now() - cache.checkedAt < READ_TTL_MS) return cache;
  const etag = await remoteEtag();
  if (cache && cache.etag === etag) {
    cache.checkedAt = Date.now();
    return cache;
  }
  const r = await get(DB_PATH, { access: 'private', useCache: false, abortSignal: signal() });
  if (!r?.stream) throw new Error('Не удалось прочитать базу из Vercel Blob');
  cache = { json: (await toBuffer(r.stream)).toString('utf8'), etag, checkedAt: Date.now() };
  return cache;
}

async function saveRemote(data: DbShape, etag: string): Promise<void> {
  const body = JSON.stringify(data);
  const r = await put(DB_PATH, body, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', ifMatch: etag, abortSignal: signal() });
  // ETag новой версии, если SDK его вернул; иначе следующий запрос перечитает базу
  const newTag = (r as { etag?: string }).etag;
  cache = newTag ? { json: body, etag: newTag, checkedAt: Date.now() } : null;
}

// ---------- ответ копится в памяти и уходит клиенту только после успешной записи базы ----------
class CapturedResponse extends Writable {
  statusCode = 200;
  private headers: Record<string, string | string[] | number> = {};
  private chunks: Buffer[] = [];
  setHeader(k: string, v: string | string[] | number) { this.headers[k.toLowerCase()] = v; return this; }
  getHeader(k: string) { return this.headers[k.toLowerCase()]; }
  writeHead(status: number, headers?: Record<string, string | string[] | number>) {
    this.statusCode = status;
    for (const [k, v] of Object.entries(headers ?? {})) this.setHeader(k, v);
    return this;
  }
  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: () => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    cb();
  }
  flushTo(out: ServerResponse) {
    if (out.headersSent || out.writableEnded) return; // клиенту уже ответили (истекло время)
    const body = Buffer.concat(this.chunks);
    for (const [k, v] of Object.entries(this.headers)) out.setHeader(k, v);
    out.setHeader('Content-Length', body.length);
    out.statusCode = this.statusCode;
    out.end(body);
  }
}

function makeReq(raw: IncomingMessage, body: Buffer, url: URL): Req {
  const r = Readable.from(body.length ? [body] : []) as unknown as Req;
  Object.assign(r, {
    method: raw.method, url: raw.url, headers: raw.headers, path: url.pathname, query: url.searchParams, params: {},
    ip: String(raw.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || raw.socket?.remoteAddress,
  });
  return r;
}

const finished = (w: Writable) => (w.writableFinished ? Promise.resolve() : new Promise<void>((ok) => w.once('finish', () => ok())));

// Ответы, которым база не нужна (проверка сервера и входа), — без обращения к Blob
const NO_DB = new Set(['/api/v1/health', '/api/v1/auth/status', '/api/v1/auth/login', '/api/v1/auth/logout']);

async function handle(raw: IncomingMessage, out: ServerResponse, body: Buffer, url: URL) {
  if (NO_DB.has(url.pathname)) {
    const res = new CapturedResponse();
    await dispatch(makeReq(raw, body, url), res as unknown as ServerResponse);
    await finished(res);
    return res.flushTo(out);
  }
  const readOnly = raw.method === 'GET' || raw.method === 'HEAD';
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 50 + Math.random() * 150 * attempt));
    const remote = await loadRemote(readOnly && attempt === 0);
    const data = JSON.parse(remote.json) as DbShape;
    const ctx: RequestContext = {
      data,
      dirty: false,
      emit(room, type, payload) {
        const ev = data.events ?? (data.events = []);
        ev.push({ seq: (ev[ev.length - 1]?.seq ?? 0) + 1, room, type, payload, at: Date.now() });
        if (ev.length > MAX_EVENTS) ev.splice(0, ev.length - MAX_EVENTS);
        ctx.dirty = true;
      },
    };
    const res = new CapturedResponse();
    await requestContext.run(ctx, async () => {
      applyStoredDictionaries();
      const req = makeReq(raw, body, url);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (guard(req, res as unknown as ServerResponse)) {
        const handled = await dispatch(req, res as unknown as ServerResponse);
        if (!handled) json(res as unknown as ServerResponse, 404, { error: 'Не найдено' });
      }
      await finished(res);
    });

    if (ctx.dirty) {
      try {
        await saveRemote(data, remote.etag);
      } catch (e) {
        if (isPrecondition(e)) { // базу только что изменил другой компьютер — повторяем
          console.warn('[db] версия изменилась, повтор', attempt + 1, url.pathname);
          cache = null;
          continue;
        }
        throw e;
      }
    }
    return res.flushTo(out);
  }
  json(out, 409, { error: 'Данные одновременно изменили на другом компьютере. Повторите действие.' });
}

export default async function handler(raw: IncomingMessage, out: ServerResponse) {
  try {
    const url = new URL(raw.url ?? '/', 'http://localhost');
    // маршрут Vercel передаёт исходный путь в __p (см. scripts/build-vercel.mjs)
    const orig = url.searchParams.get('__p');
    if (orig) {
      url.searchParams.delete('__p');
      url.pathname = orig;
    }
    if (!process.env.PUBLIC_URL) {
      const host = raw.headers['x-forwarded-host'] ?? raw.headers.host;
      if (host) config.publicUrl = `https://${String(host).split(',')[0].trim()}`;
    }
    const body = raw.method === 'GET' || raw.method === 'HEAD' ? Buffer.alloc(0) : await readBody(raw, 25 * 1024 * 1024);
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((ok) => { timer = setTimeout(() => ok('timeout'), REQUEST_TIMEOUT_MS); });
    const work = handle(raw, out, body, url).then(() => 'done' as const);
    const result = await Promise.race([work, timeout]);
    if (result === 'timeout') work.catch((e) => console.error('[vercel] после таймаута:', url.pathname, e));
    clearTimeout(timer);
    const ms = Date.now() - started;
    if (result === 'timeout') {
      console.error('[timeout]', raw.method, url.pathname, `${ms}ms`);
      if (!out.headersSent) json(out, 504, { error: 'Сервер не ответил вовремя. Повторите действие.' });
    } else if (ms > 3000) console.warn('[slow]', raw.method, url.pathname, `${ms}ms`);
  } catch (e) {
    console.error('[vercel]', raw.method, raw.url, e);
    if (!out.headersSent) json(out, 500, { error: 'Внутренняя ошибка сервера' });
  }
}
