// Сборка сервера: TypeScript + серверный рендер React-шаблонов PDF → server/dist/server.mjs
import { build } from 'esbuild';
import { serverBuildOptions } from './server-build-options.mjs';

await build(serverBuildOptions);
