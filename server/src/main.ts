import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { config, lanIp } from './config';
import { flushDb, loadDb } from './db';
import { seedDb } from './seed';
import { dispatch, json, serveStatic, type Req } from './http';
import { attachRealtime } from './realtime';
import { applyStoredDictionaries, registerRoutes } from './routes';
import { startPollers, channelMode } from './gateways';
import { browserPath, closePdfEngine, warmUpPdfEngine } from './pdf';

loadDb(seedDb);
applyStoredDictionaries();
registerRoutes();

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
  if (serveStatic(config.distDir, req, res)) return;
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Фронтенд не собран. Выполните: npm run build');
});

attachRealtime(server);
startPollers();
warmUpPdfEngine();

server.listen(config.port, config.host, () => {
  const local = `http://localhost:${config.port}`;
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
  if (e.code === 'EADDRINUSE') console.error(`\n  Порт ${config.port} занят. Укажите другой в .env (PORT=3001) или закройте предыдущий запуск.\n`);
  else console.error(e);
  process.exit(1);
});

const shutdown = async () => {
  flushDb();
  await closePdfEngine();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
