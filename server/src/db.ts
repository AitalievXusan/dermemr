import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import type {
  Channel, DeliveryStatus, DocsSelection, EncounterState, GeneratedDoc, HistoryItem, Marker, Patient, PreviousVisit, ProcedureItem, Soap,
} from '../../src/types';
import type { DayCourse } from '../../src/data/dayHospital';

// Встроенное JSON-хранилище для локального запуска (одна клиника, один компьютер).
// Структура повторяет таблицы SPEC §2.1; для продакшена — server/db/schema.sql (PostgreSQL).

export interface EncounterRec {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentType: EncounterState['appointmentType'];
  status: EncounterState['status'];
  startedAt: number | null;
  completedAt: string | null;
  draftVersion: number;
  soap: Soap;
  markers: Marker[];
  billing: EncounterState['billing'];
  docs: DocsSelection;
  previousVisit: PreviousVisit | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaRec {
  id: string;
  encounterId: string;
  patientId: string;
  markerId: string | null;
  mediaType: 'MACRO_PHOTO' | 'DERMATOSCOPY' | 'TRICHOSCOPY';
  file: string;
  mime: string;
  includeInPdf: boolean;
  date: string;
  createdAt: string;
  source: 'DESKTOP' | 'MOBILE_QR' | 'SEED';
}

export interface CartRec {
  id: string;
  encounterId: string;
  patientName: string;
  status: 'DRAFT' | 'SENT_TO_CASHIER' | 'PAID' | 'UPDATED_AFTER_SEND';
  payerType: 'CASH' | 'DMS' | 'CORPORATE';
  discountPercent: number;
  items: (ProcedureItem & { finalPrice: number })[];
  totalRendered: number;
  totalPrescribed: number;
  syncedAt: string;
  paidAt: string | null;
}

export interface DocRec extends GeneratedDoc {
  encounterId: string;
  patientId: string;
  file: string;
  format: 'pdf' | 'html';
}

export interface DeliveryRec {
  id: string;
  encounterId: string;
  patientId: string;
  channel: Channel;
  recipientContact: string;
  consentVerified: boolean;
  status: Exclude<DeliveryStatus, 'IDLE'>;
  documentIds: string[];
  externalMessageId: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface LinkToken {
  token: string;
  patientId: string;
  channel: 'TELEGRAM' | 'MAX';
  deliveryId: string;
  createdAt: string;
}

export interface DbShape {
  version: 1;
  patients: Patient[];
  labs: Record<string, HistoryItem[]>; // по patientId (из ЛИС)
  encounters: EncounterRec[];
  media: MediaRec[];
  carts: CartRec[];
  documents: DocRec[];
  deliveries: DeliveryRec[];
  portal: { patientId: string; encounterId: string; documentIds: string[]; publishedAt: string; readAt: string | null }[];
  linkTokens: LinkToken[];
  dictionaries: Record<string, unknown>;
  /** Дневной стационар (появилось позже — в старых db.json поля нет). */
  dayCourses?: DayCourse[];
}

const FILE = resolve(config.dataDir, 'db.json');
let data: DbShape;
let timer: ReturnType<typeof setTimeout> | undefined;

export function loadDb(seed: () => DbShape): DbShape {
  if (existsSync(FILE)) {
    data = JSON.parse(readFileSync(FILE, 'utf8')) as DbShape;
  } else {
    data = seed();
    flushDb();
  }
  return data;
}

export const db = () => data;

/** Отложенная атомарная запись (tmp + rename), чтобы не терять данные при сбое. */
export function saveDb() {
  clearTimeout(timer);
  timer = setTimeout(flushDb, 200);
}

export function flushDb() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, FILE);
}
