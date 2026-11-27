import { AsyncLocalStorage } from 'node:async_hooks';
import type { DbShape } from './db';

// Облачный режим: у каждого запроса своя копия базы, поэтому запросы выполняются параллельно
// и не ждут друг друга. Локальный сервер контекст не использует — там одна база в памяти.
export interface RequestContext {
  data: DbShape;
  dirty: boolean;
  emit: (room: string, type: string, payload: unknown) => void;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
