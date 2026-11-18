// Клиент API (SPEC §3). Если сервер недоступен (например, запущен только `vite`),
// приложение работает в демо-режиме на локальных данных — с теми же сценариями.
import type { Channel, DeliveryStatus, EncounterState, GeneratedDoc, Patient } from '../types';
import type { CdssAlert } from './cdss';
import { checkDrug } from './cdss';
import { applyDictionaries, type Dictionaries } from '../data/dictionaries';
import type { MediaItem } from '../components/left/media';

export interface ServerConfig {
  publicUrl: string;
  pdfEngine: 'chromium' | 'none';
  channels: Record<Channel, 'live' | 'simulation'>;
}

export const server: { online: boolean; config: ServerConfig | null } = { online: false, config: null };

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: Record<string, unknown>) { super(message); }
}

async function req<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isBlob = body instanceof Blob;
  const res = await fetch(path, {
    method,
    headers: { ...(body !== undefined && !isBlob ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? res.statusText), data);
  return data as T;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Проверка сервера + загрузка конфигурации и справочников. */
export async function initServer(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const h = await fetch('/api/v1/health', { signal: ctrl.signal });
    clearTimeout(t);
    if (!h.ok) throw new Error('health');
    server.config = await req<ServerConfig>('GET', '/api/v1/config');
    applyDictionaries(await req<Dictionaries>('GET', '/api/v1/dictionaries'));
    server.online = true;
  } catch {
    server.online = false;
  }
  return server.online;
}

// ---------- Очередь и пациенты ----------
export interface QueueItem {
  id: string;
  status: EncounterState['status'];
  appointmentType: EncounterState['appointmentType'];
  startedAt: number | null;
  updatedAt: string;
  diagnosis: string;
  patient: { id: string; fullName: string; sex: 'F' | 'M'; age: string; cardNumber: string; allergies: string[]; isPregnantOrLactating: boolean };
}
export const fetchQueue = () => req<QueueItem[]>('GET', '/api/v1/encounters');
export const fetchPatients = () => req<{ id: string; fullName: string; cardNumber: string; age: string }[]>('GET', '/api/v1/patients');
export const createPatient = (p: Partial<Patient>) => req<{ patientId: string; encounterId: string }>('POST', '/api/v1/patients', p);
export const newVisit = (encounterId: string) => req<{ encounterId: string }>('POST', `/api/v1/encounters/${encounterId}/new-visit`);
export const updatePatient = (id: string, patch: Partial<Patient>) =>
  server.online ? req<Patient>('PATCH', `/api/v1/patients/${id}`, patch) : Promise.resolve(patch as Patient);

// ---------- Визит ----------
export interface EncounterPayload {
  encounter: EncounterState;
  media: MediaItem[];
  isotretinoinHistoryMg: number;
  updatedAt: string;
}
export const fetchEncounter = (id: string) => req<EncounterPayload>('GET', `/api/v1/encounters/${id}`);

let mockVersion = 14;
/** PATCH /draft c If-Match (optimistic locking). */
export async function patchDraft(encounterId: string, ifMatch: number, payload: unknown) {
  if (!server.online) {
    await delay(120);
    if (ifMatch !== mockVersion && ifMatch !== 0) mockVersion = ifMatch;
    mockVersion += 1;
    return { ok: true as const, draft_version: mockVersion, saved_at: new Date().toISOString() };
  }
  try {
    const r = await req<{ draft_version: number; saved_at: string }>('PATCH', `/api/v1/encounters/${encounterId}/draft`, payload, { 'If-Match': String(ifMatch) });
    return { ok: true as const, ...r };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { ok: false as const, status: 409, serverVersion: Number(e.data?.draft_version) };
    throw e;
  }
}

export const setEncounterStatus = (id: string, status: EncounterState['status']) =>
  server.online ? req<{ status: string; startedAt: number }>('POST', `/api/v1/encounters/${id}/status`, { status }) : Promise.resolve({ status, startedAt: Date.now() });

export async function completeEncounter(id: string, local: EncounterState): Promise<string[]> {
  if (!server.online) return validateCompletion(local);
  try {
    await req('POST', `/api/v1/encounters/${id}/complete`);
    return [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) return (e.data?.details as string[]) ?? [e.message];
    throw e;
  }
}

/** Клиентская валидация (дублирует серверную, для мгновенной подсказки). */
export function validateCompletion(state: EncounterState): string[] {
  const errors: string[] = [];
  if (!state.soap.assessment.primaryDiagnosis.icd10Code) errors.push('Не указан основной диагноз по МКБ-10');
  const o = state.soap.objective;
  if (!o.statusLocalis.trim() && !o.localizationText.trim()) errors.push('Не заполнен Status Localis');
  return errors;
}

// ---------- Медиа и QR-мост ----------
export const fetchPatientMedia = (patientId: string) => req<MediaItem[]>('GET', `/api/v1/patients/${patientId}/media`);
export const uploadMedia = (encounterId: string, file: Blob, markerId: string | null, kind = 'MACRO_PHOTO') =>
  req<MediaItem>('POST', `/api/v1/encounters/${encounterId}/media?marker_id=${encodeURIComponent(markerId ?? '')}&kind=${kind}`, file, { 'Content-Type': file.type || 'image/jpeg' });
export const patchMedia = (id: string, patch: { includeInPdf?: boolean }) => req<MediaItem>('PATCH', `/api/v1/media/${id}`, patch);
export const createQrSession = (encounterId: string) =>
  req<{ token: string; url: string; expiresAt: number; svg: string }>('POST', `/api/v1/encounters/${encounterId}/qr-session`);

// ---------- CDSS ----------
export async function cdssCheck(encounterId: string, drugName: string, currentDrugs: string[], patient: Patient): Promise<CdssAlert[]> {
  if (!server.online) return checkDrug(drugName, patient, currentDrugs);
  try {
    const r = await req<{ alerts: CdssAlert[] }>('POST', '/api/v1/cdss/check', { encounter_id: encounterId, drug_name: drugName, current_drugs: currentDrugs });
    return r.alerts;
  } catch {
    return checkDrug(drugName, patient, currentDrugs);
  }
}

// ---------- Биллинг и касса ----------
export async function syncBilling(encounterId: string, isUpdate: boolean) {
  if (!server.online) {
    await delay(400);
    return { ok: true, event: isUpdate ? 'CASHIER_CART_UPDATED' : 'CASHIER_CART_RECEIVED' };
  }
  return req<{ ok: boolean; event: string }>('POST', `/api/v1/encounters/${encounterId}/billing/sync`);
}
export interface Cart {
  id: string;
  encounterId: string;
  patientName: string;
  status: 'DRAFT' | 'SENT_TO_CASHIER' | 'PAID' | 'UPDATED_AFTER_SEND';
  payerType: string;
  discountPercent: number;
  items: { id: string; serviceCode: string; name: string; category: 'RENDERED' | 'PRESCRIBED'; quantity: number; unitPrice: number; finalPrice: number }[];
  totalRendered: number;
  totalPrescribed: number;
  syncedAt: string;
  paidAt: string | null;
}
export const fetchCarts = () => req<Cart[]>('GET', '/api/v1/cashier/carts');
export const payCart = (id: string) => req<Cart>('POST', `/api/v1/cashier/carts/${id}/pay`);

// ---------- Документы и доставка ----------
export interface GenerateResult {
  engine: 'chromium' | 'html-fallback';
  ms: number;
  verificationHash: string;
  documents: (GeneratedDoc & { format: 'pdf' | 'html' })[];
}
export const generateDocuments = (encounterId: string) => req<GenerateResult>('POST', `/api/v1/encounters/${encounterId}/documents/generate`);

export async function dispatchDocuments(
  encounterId: string,
  channels: Channel[],
  documentIds: string[],
  onLocalStatus: (ch: Channel, s: DeliveryStatus) => void,
): Promise<{ rejected: { channel: Channel; reason: string }[] }> {
  if (!server.online) {
    for (const ch of channels) void simulateLocal(ch, onLocalStatus);
    return { rejected: [] };
  }
  try {
    return await req<{ rejected: { channel: Channel; reason: string }[] }>('POST', `/api/v1/encounters/${encounterId}/documents/dispatch`, { channels, document_ids: documentIds });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return { rejected: (e.data?.rejected as { channel: Channel; reason: string }[]) ?? [] };
    throw e;
  }
}

async function simulateLocal(ch: Channel, on: (ch: Channel, s: DeliveryStatus) => void) {
  on(ch, 'QUEUED');
  await delay(600);
  on(ch, 'SENT');
  await delay(1400);
  on(ch, 'DELIVERED');
  if (ch !== 'PATIENT_PORTAL') {
    await delay(2600);
    on(ch, 'READ');
  }
}

export interface PortalData {
  patient: { fullName: string; cardNumber: string };
  records: {
    encounterId: string;
    publishedAt: string;
    diagnosis: string;
    followUpDays?: number;
    prescribed: string[];
    documents: { id: string; docType: string; title: string; url: string; format: string }[];
  }[];
}
export const fetchPortal = (patientId: string) => req<PortalData>('GET', `/api/v1/portal/${patientId}`);
