// Общие параметры сборки сервера (используются build-server.mjs и dev.mjs)
export const serverBuildOptions = {
  entryPoints: ['server/src/main.ts'],
  outfile: 'server/dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  jsx: 'automatic',
  sourcemap: true,
  external: ['puppeteer-core', 'ws'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
};
