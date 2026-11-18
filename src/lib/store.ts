import { useSyncExternalStore } from 'react';

/**
 * Минимальный внешний стор (аналог Zustand) поверх useSyncExternalStore.
 * set() получает копию состояния, которую можно мутировать.
 * Селекторы должны возвращать части состояния, а не новые объекты.
 */
export interface Store<T> {
  get: () => T;
  set: (mutator: (draft: T) => void) => void;
  replace: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => state,
    set(mutator) {
      const draft = structuredClone(state);
      mutator(draft);
      state = draft;
      emit();
    },
    replace(next) {
      state = next;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

let uidCounter = 0;
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${(uidCounter++).toString(36)}`;
