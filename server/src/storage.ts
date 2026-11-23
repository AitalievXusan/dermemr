import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';

// Файлы снимков и документов. Локально — папка storage/, в облаке — Vercel Blob (private).
export type FileKind = 'media' | 'documents';

export interface FileStore {
  put(kind: FileKind, name: string, buf: Buffer, mime: string): Promise<void>;
  get(kind: FileKind, name: string): Promise<Buffer | null>;
}

const localStore: FileStore = {
  async put(kind, name, buf) {
    writeFileSync(resolve(config.dataDir, kind, name), buf);
  },
  async get(kind, name) {
    const f = resolve(config.dataDir, kind, name);
    return existsSync(f) ? readFileSync(f) : null;
  },
};

let store: FileStore = localStore;
export const setFileStore = (s: FileStore) => { store = s; };
export const putFile = (kind: FileKind, name: string, buf: Buffer, mime: string) => store.put(kind, name, buf, mime);
export const getFile = (kind: FileKind, name: string) => store.get(kind, name);
