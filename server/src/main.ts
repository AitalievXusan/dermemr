import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { config, lanIp, ROOT } from './config';
import { flushDb, loadDb } from './db';
import { seedDb } from './seed';
import { dispatch, json, sendFile, serveStatic, type Req } from './http';
import { attachRealtime } from './realtime';
import { applyStoredDictionaries, registerRoutes } from './routes';
import { registerDayHospitalRoutes } from './dayHospital';
import { startPollers, channelMode } from './gateways';
import { browserPath, closePdfEngine, warmUpPdfEngine } from './pdf';

loadDb(seedDb);
applyStoredDictionaries();
registerRoutes();
registerDayHospitalRoutes();

const GUIDELINES_DIR = resolve(ROOT, 'guidelines');

const server = createServer(async (rawReq, res) => {
  const req = rawReq as Req;
  const url = new URL(rawReq.url ?? '/', 'http://localhost');
  req.path = url.pathname;
  req.query = url.searchParams;
  req.params = {};
  req.ip = rawReq.socket.remoteAddress;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // CORS для режима разработки (Vite на :5173)
  const origin = rawReq.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (rawReq.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  }
  if (await dispatch(req, res)) return;
  if (req.path.startsWith('/api/')) return json(res, 404, { error: 'Не найдено' });
  // PDF клинических протоколов и стандартов из папки guidelines/ (ссылки из подсказок в карте приема)
  if (req.path.startsWith('/guidelines/') && (req.method === 'GET' || req.method === 'HEAD')) {
    let name = '';
    try { name = basename(decodeURIComponent(req.path.slice('/guidelines/'.length))); } catch { /* битый URL */ }
    const file = join(GUIDELINES_DIR, name);
    if (name && file.toLowerCase().endsWith('.pdf') && existsSync(file)) return sendFile(res, file, { mime: 'application/pdf' });
    return json(res, 404, { error: 'Документ не найден' });
  }
  if (serveStatic(config.distDir, req, res)) return;
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Фронтенд не собран. Выполните: npm run build');
});

attachRealtime(server);
startPollers();
warmUpPdfEngine();

// Если порт занят другим приложением (например, другим проектом на :3000) — берем следующий свободный.
let port = config.port;
const listen = () => server.listen(port, config.host);
listen();

server.on('listening', () => {
  config.port = port;
  if (!process.env.PUBLIC_URL) config.publicUrl = `http://${lanIp() ?? 'localhost'}:${port}`;
  const local = `http://localhost:${port}`;
  const lan = lanIp();
  console.log('\n  DermEMR — онлайн медицинская карта приема дерматолога');
  console.log(`  Откройте в браузере:   ${local}`);
  if (lan) console.log(`  В локальной сети:      http://${lan}:${config.port}  (смартфон для QR-загрузки)`);
  console.log(`  Данные:                ${config.dataDir}`);
  console.log(`  PDF-движок:            ${browserPath() ?? 'не найден (документы будут в HTML для печати)'}`);
  console.log(`  Каналы: Telegram — ${channelMode('TELEGRAM')}, WhatsApp — ${channelMode('WHATSAPP')}, MAX — ${channelMode('MAX')}`);
  if (!existsSync(config.distDir)) console.log('  ВНИМАНИЕ: папка dist/ не найдена — выполните npm run build');
  console.log('  Остановить: Ctrl+C\n');
  if (config.openBrowser && existsSync(config.distDir)) {
    const cmd = process.platform === 'win32' ? `start "" "${local}"` : process.platform === 'darwin' ? `open "${local}"` : `xdg-open "${local}"`;
    exec(cmd, () => undefined);
  }
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE' && port < config.port + 20) {
    console.log(`  Порт ${port} занят другим приложением — пробую ${port + 1}…`);
    port += 1;
    setTimeout(listen, 100);
    return;
  }
  console.error(e.code === 'EADDRINUSE' ? `\n  Порты ${config.port}–${port} заняты. Укажите другой в .env (PORT=...).\n` : e);
  process.exit(1);
});

const shutdown = async () => {
  flushDb();
  await closePdfEngine();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
