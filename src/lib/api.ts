// Клиент API (SPEC §3). Если сервер недоступен (например, запущен только `vite`),
// приложение работает в демо-режиме на локальных данных — с теми же сценариями.
import type { Channel, DeliveryStatus, EncounterState, GeneratedDoc, Patient } from '../types';
import type { CdssAlert } from './cdss';
import { checkDrug } from './cdss';
import { applyDictionaries, type Dictionaries } from '../data/dictionaries';
import type { MediaItem } from '../components/left/media';
import { templateRows, todayIso, type DayCourse, type DayCourseInput } from '../data/dayHospital';
import { defaultVitAfter, defaultVitRows } from '../data/vitBuilder';

export interface ServerConfig {
  publicUrl: string;
  pdfEngine: 'chromium' | 'none';
  /** ws — локальный сервер; poll — облачная версия (Vercel), события забираются опросом. */
  realtime?: 'ws' | 'poll';
  /** Включён вход по паролю. */
  auth?: boolean;
  channels: Record<Channel, 'live' | 'simulation'>;
}

export const server: { online: boolean; config: ServerConfig | null; needLogin: boolean } = { online: false, config: null, needLogin: false };

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
  // сессия истекла — перезагрузка покажет экран входа
  if (res.status === 401 && data.auth && !server.needLogin) { server.needLogin = true; location.reload(); }
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? res.statusText), data);
  return data as T;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Проверка сервера + загрузка конфигурации и справочников. */
/** Демо без сервера: GitHub Pages и файл, открытый с диска. Везде остальное сервер есть всегда. */
const STATIC_DEMO = location.protocol === 'file:' || location.hostname.endsWith('github.io');

/**
 * Запуск: один запрос /api/v1/boot (вход, настройки, справочники). Если сервер не ответил,
 * повторяем, а не уходим в демо-режим: иначе в облаке при медленном ответе врач работал бы
 * с данными в браузере, которые не видят другие компьютеры.
 */
export async function initServer(onWait?: (attempt: number) => void): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch('/api/v1/boot', { cache: 'no-store', signal: AbortSignal.timeout(STATIC_DEMO ? 2500 : 20000) });
      if (!r.ok) throw new Error(`boot ${r.status}`);
      const boot = (await r.json()) as { auth: { required: boolean; loggedIn: boolean }; config?: ServerConfig; dictionaries?: Dictionaries };
      if (boot.auth.required && !boot.auth.loggedIn) {
        server.needLogin = true;
        return false;
      }
      server.config = boot.config ?? null;
      if (boot.dictionaries) applyDictionaries(boot.dictionaries);
      server.online = true;
      return true;
    } catch {
      if (STATIC_DEMO) {
        server.online = false;
        return false;
      }
      onWait?.(attempt);
      await new Promise((ok) => setTimeout(ok, Math.min(1500 * (attempt + 1), 6000)));
    }
  }
}

/** Вход по общему паролю клиники (облачная версия). */
export async function login(password: string): Promise<void> {
  await req('POST', '/api/v1/auth/login', { password });
}

export async function logout(): Promise<void> {
  await req('POST', '/api/v1/auth/logout').catch(() => undefined);
  location.reload();
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
/**
 * Снимки с фотоаппарата и телефона весят 3–10 МБ: уменьшаем до 2400 px по длинной стороне
 * (как на странице загрузки со смартфона). Загрузка в разы быстрее, а облако принимает не больше 4,5 МБ.
 */
async function shrinkImage(file: Blob): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 2400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.88));
    return out && out.size < file.size ? out : file;
  } catch {
    return file; // формат, который браузер не открывает (например, HEIC), отправляем как есть
  }
}

export const uploadMedia = async (encounterId: string, file: Blob, markerId: string | null, kind = 'MACRO_PHOTO') => {
  const body = await shrinkImage(file);
  return req<MediaItem>('POST', `/api/v1/encounters/${encounterId}/media?marker_id=${encodeURIComponent(markerId ?? '')}&kind=${kind}`, body, { 'Content-Type': body.type || 'image/jpeg' });
};
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

// ---------- Дневной стационар ----------
// Без сервера курсы хранятся в браузере (localStorage), чтобы раздел работал и в демо-режиме.
const DH_LOCAL = 'dermemr-day-courses';
const localCourses = (): DayCourse[] => {
  try {
    return JSON.parse(localStorage.getItem(DH_LOCAL) || '[]') as DayCourse[];
  } catch {
    return [];
  }
};
const saveLocalCourses = (list: DayCourse[]) => {
  try {
    localStorage.setItem(DH_LOCAL, JSON.stringify(list));
  } catch { /* переполнение хранилища — данные останутся до перезагрузки */ }
};

export async function listDayCourses(): Promise<DayCourse[]> {
  if (server.online) return req<DayCourse[]>('GET', '/api/v1/day-courses');
  return localCourses().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDayCourse(id: string): Promise<DayCourse> {
  if (server.online) return req<DayCourse>('GET', `/api/v1/day-courses/${encodeURIComponent(id)}`);
  const c = localCourses().find((x) => x.id === id);
  if (!c) throw new ApiError(404, 'Курс не найден');
  return c;
}

export async function createDayCourse(input: DayCourseInput & { fromEncounterId?: string }): Promise<DayCourse> {
  if (server.online) return req<DayCourse>('POST', '/api/v1/day-courses', input);
  const now = new Date().toISOString();
  const template = input.template ?? 'empty';
  const c: DayCourse = {
    id: `dh_${Date.now().toString(36)}`, encounterId: input.fromEncounterId ?? null, patientId: null, fio: '', birthYear: '', phone: '', diagnosis: '', doctor: '',
    startDate: todayIso(), template, lang: 'ru', rows: template === 'vit' ? defaultVitRows(todayIso()) : templateRows(template),
    ...(template === 'vit' ? { after: defaultVitAfter(todayIso()), followWeeks: 4 } : {}), status: 'ACTIVE', createdAt: now, updatedAt: now, ...input,
  };
  saveLocalCourses([...localCourses(), c]);
  return c;
}

export async function patchDayCourse(id: string, patch: DayCourseInput): Promise<DayCourse> {
  if (server.online) return req<DayCourse>('PATCH', `/api/v1/day-courses/${encodeURIComponent(id)}`, patch);
  const list = localCourses();
  const c = list.find((x) => x.id === id);
  if (!c) throw new ApiError(404, 'Курс не найден');
  Object.assign(c, patch, { updatedAt: new Date().toISOString() });
  saveLocalCourses(list);
  return c;
}

export async function deleteDayCourse(id: string): Promise<void> {
  if (server.online) {
    await req('DELETE', `/api/v1/day-courses/${encodeURIComponent(id)}`);
    return;
  }
  saveLocalCourses(localCourses().filter((x) => x.id !== id));
}
