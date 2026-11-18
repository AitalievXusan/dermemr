// Режим разработки: сервер API (пересборка и перезапуск при изменениях) + Vite с горячей перезагрузкой.
import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { serverBuildOptions } from './server-build-options.mjs';

let server;
const restart = () => {
  server?.kill();
  server = spawn(process.execPath, ['server/dist/server.mjs'], { stdio: 'inherit', env: { ...process.env, OPEN_BROWSER: '0' } });
};

const ctx = await context({
  ...serverBuildOptions,
  logLevel: 'warning',
  plugins: [{ name: 'restart', setup: (b) => b.onEnd((r) => { if (!r.errors.length) restart(); }) }],
});
await ctx.watch();

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
const stop = () => { server?.kill(); vite.kill(); ctx.dispose(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
