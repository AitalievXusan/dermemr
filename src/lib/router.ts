import { useSyncExternalStore } from 'react';

// Минимальный hash-роутер: работает при открытии с любого пути и с file-сервера.
export type Route =
  | { name: 'queue' }
  | { name: 'encounter'; id: string }
  | { name: 'cashier' }
  | { name: 'portal'; patientId: string | null };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'encounter' && parts[1]) return { name: 'encounter', id: parts[1] };
  if (parts[0] === 'cashier') return { name: 'cashier' };
  if (parts[0] === 'portal') return { name: 'portal', patientId: parts[1] ?? null };
  return { name: 'queue' };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export const useHash = () => useSyncExternalStore(subscribe, () => window.location.hash);
export const navigate = (path: string) => { window.location.hash = path; };
