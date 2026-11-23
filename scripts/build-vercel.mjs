// Сборка облачной версии для Vercel (Build Output API v3):
//   .vercel/output/static        — фронтенд (dist/)
//   .vercel/output/functions/api.func — сервер одной функцией (server/src/vercel.ts)
// Локальная сборка (npm run build) этим скриптом не пользуется.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '.vercel/output';
const FUNC = join(OUT, 'functions', 'api.func');
const alias = process.env.DERMEMR_BLOB_MOCK ? { '@vercel/blob': process.env.DERMEMR_BLOB_MOCK } : {};

if (!existsSync('dist/index.html')) throw new Error('Сначала выполните vite build');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(FUNC, { recursive: true });
cpSync('dist', join(OUT, 'static'), { recursive: true });

await build({
  entryPoints: ['server/src/vercel.ts'],
  outfile: join(FUNC, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  jsx: 'automatic',
  sourcemap: false,
  alias,
  // puppeteer в облаке не используется (документы — HTML); у ws необязательные нативные модули
  external: ['puppeteer-core', 'bufferutil', 'utf-8-validate'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

// демо-снимки для первого запуска
mkdirSync(join(FUNC, 'server', 'seed'), { recursive: true });
for (const f of readdirSync('server/seed')) cpSync(join('server/seed', f), join(FUNC, 'server', 'seed', f));

writeFileSync(join(FUNC, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  supportsResponseStreaming: false,
  maxDuration: 60,
}, null, 2));
writeFileSync(join(FUNC, 'package.json'), JSON.stringify({ type: 'module' }));

writeFileSync(join(OUT, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, continue: true },
    // исходный путь передаётся функции в параметре __p (функция одна на все маршруты сервера)
    { src: '/((?:api|media|m|verify|webhooks)(?:/.*)?)', dest: '/api?__p=/$1' },
    { handle: 'filesystem' },
    { src: '/guidelines/(.*)', status: 404, dest: '/index.html' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}, null, 2));
console.log('Vercel output →', OUT);
