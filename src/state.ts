import { createStore, uid, useStore } from './lib/store';
import { createInitialEncounter } from './data/mockEncounter';
import { findPrice, type PriceEntry } from './data/priceList';
import type { NosologyTemplate } from './data/templates';
import type { CdssAlert } from './lib/cdss';
import { idbGet, idbPut } from './lib/idb';
import { cdssCheck, fetchEncounter, fetchPatientMedia, patchDraft, server, updatePatient } from './lib/api';
import { joinRoom, leaveRoom, onEvent, startRealtime } from './lib/ws';
import { media, seedDemoMedia } from './components/left/media';
import type {
  BillingCategory, CalcKey, CalcResult, Channel, DeliveryStatus, EncounterState, Marker, ProcedureItem, Projection, Severity, Soap, Theme,
} from './types';

// ---------------- Сторы ----------------
export const encounter = createStore<EncounterState>(createInitialEncounter());

export interface Toast { id: string; text: string; tone: 'default' | 'success' | 'danger' }
export interface UiState {
  theme: Theme;
  toasts: Toast[];
  docsModalOpen: boolean;
  // В сторе только сериализуемые данные (structuredClone): цель назначения вместо колбэка
  cdss: { alerts: CdssAlert[]; drugName: string; target: { list: 'topicalTherapy' | 'systemicTherapy'; id: string } } | null;
  lightbox: boolean;
  online: boolean;
  loading: boolean;
  loadError: string | null;
  qr: { url: string; svg: string; expiresAt: number } | null;
  deliveryErrors: Partial<Record<Channel, string>>;
  isoHistoryMg: number;
}

const storedTheme = (() => {
  try {
    return (localStorage.getItem('dermemr-theme') as Theme) || 'light';
  } catch {
    return 'light' as Theme;
  }
})();

export const ui = createStore<UiState>({
  theme: storedTheme,
  toasts: [],
  docsModalOpen: false,
  cdss: null,
  lightbox: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  loading: false,
  loadError: null,
  qr: null,
  deliveryErrors: {},
  isoHistoryMg: 0,
});

export const useEnc = <S,>(sel: (s: EncounterState) => S) => useStore(encounter, sel);
export const useUi = <S,>(sel: (s: UiState) => S) => useStore(ui, sel);

// ---------------- UI-действия ----------------
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('dermemr-theme', theme);
  } catch { /* ignore */ }
  ui.set((s) => { s.theme = theme; });
}

/** Тосты — только для сетевых операций (DESIGN §6.2). */
export function toast(text: string, tone: Toast['tone'] = 'default') {
  const id = uid('t');
  ui.set((s) => { s.toasts.push({ id, text, tone }); });
  setTimeout(() => ui.set((s) => { s.toasts = s.toasts.filter((t) => t.id !== id); }), 4200);
}

// ---------------- SOAP ----------------
export function updateSoap(mutator: (soap: Soap) => void) {
  encounter.set((s) => {
    mutator(s.soap);
    if (s.status === 'WAITING') s.status = 'IN_PROGRESS';
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function addMarker(projection: Projection, x: number, y: number, anatomyCode: string, anatomyLabel: string) {
  encounter.set((s) => {
    const number = s.markers.reduce((m, k) => Math.max(m, k.number), 0) + 1;
    s.markers.push({ id: uid('mk'), number, projection, x, y, anatomyCode, anatomyLabel, lesionType: 'PLAQUE', description: '' });
    // Автосинхронизация с полем «Локализация» Status Localis (PRD §4.2.1, критерий приемки №2)
    const loc = s.soap.objective.localizationText.trim();
    const label = anatomyLabel.charAt(0).toLowerCase() + anatomyLabel.slice(1); // римские цифры пальцев не трогаем
    if (!loc.toLowerCase().includes(label)) {
      s.soap.objective.localizationText = loc ? `${loc.replace(/\.$/, '')}, ${label}.` : `${cap(label)}.`;
    }
  });
}

export function updateMarker(id: string, patch: Partial<Marker>) {
  encounter.set((s) => {
    const m = s.markers.find((k) => k.id === id);
    if (m) Object.assign(m, patch);
  });
}

export function removeMarker(id: string) {
  encounter.set((s) => {
    s.markers = s.markers.filter((m) => m.id !== id);
    s.markers.sort((a, b) => a.number - b.number).forEach((m, i) => (m.number = i + 1));
    delete s.soap.objective.dermatoscopy[id];
    syncDermatoscopyBilling(s);
  });
}

export function setProjection(p: Projection) {
  encounter.set((s) => { s.activeProjection = p; });
}

/** Количество «Дерматоскопия 1 элемента × N» = число очагов с заполненной дерматоскопией. */
export function syncDermatoscopyBilling(s: EncounterState) {
  const count = Object.keys(s.soap.objective.dermatoscopy).length;
  const items = s.soap.plan.proceduresAndLabs;
  const item = items.find((p) => p.serviceCode === 'A03.01.001');
  if (count > 0 && !item) {
    const price = findPrice('A03.01.001')!;
    items.push({ id: uid('pr'), serviceCode: price.code, name: price.name, category: 'RENDERED', quantity: count, unitPrice: price.price, source: 'AUTO_FROM_SOAP' });
    markCartChanged(s);
  } else if (item && item.source === 'AUTO_FROM_SOAP' && item.quantity !== count) {
    if (count === 0) s.soap.plan.proceduresAndLabs = items.filter((p) => p !== item);
    else item.quantity = count;
    markCartChanged(s);
  }
}

export function toggleDermatoscopy(markerId: string, on: boolean) {
  encounter.set((s) => {
    if (on) {
      s.soap.objective.dermatoscopy[markerId] ??= {
        network: '', dotsGlobules: '', streaks: false, vessels: [], blueWhiteVeil: false, miliaCysts: false, comedoOpenings: false,
      };
    } else delete s.soap.objective.dermatoscopy[markerId];
    syncDermatoscopyBilling(s);
  });
}

const SEVERITY_BY_LEVEL: Severity[] = ['MILD', 'MODERATE', 'SEVERE'];
export function insertCalculator(key: CalcKey, result: CalcResult, level: 0 | 1 | 2) {
  updateSoap((soap) => {
    soap.assessment.calculators[key] = result;
    if (key !== 'DLQI' && key !== 'UAS7') soap.assessment.primaryDiagnosis.severity = SEVERITY_BY_LEVEL[level];
  });
}

export function applyTemplate(t: NosologyTemplate) {
  encounter.set((s) => {
    const { subjective: S, objective: O, assessment: A, plan: P } = s.soap;
    if (t.complaintTags) S.complaintTags = Array.from(new Set([...S.complaintTags, ...t.complaintTags]));
    if (t.anamnesisMorbi) S.anamnesisMorbi = t.anamnesisMorbi;
    if (t.course) O.processCourse = t.course;
    if (t.distribution) O.distribution = t.distribution;
    if (t.symmetry) O.symmetry = t.symmetry;
    if (t.primaryElements) O.primaryElements = t.primaryElements;
    if (t.secondaryElements) O.secondaryElements = t.secondaryElements;
    if (t.statusLocalis) O.statusLocalis = t.statusLocalis;
    if (t.bordersDescription) O.bordersDescription = t.bordersDescription;
    A.primaryDiagnosis = {
      icd10Code: t.icd10Code,
      icd10Name: t.icd10Name,
      clinicalForm: t.clinicalForm ?? t.title,
      stage: t.stage ?? A.primaryDiagnosis.stage,
      severity: A.primaryDiagnosis.severity,
    };
    if (t.topical) P.topicalTherapy = t.topical.map((x) => ({ ...x, id: uid('top'), taperingScheme: x.taperingScheme ?? '' }));
    if (t.skincare) P.skincareRoutine = t.skincare.map((x) => ({ ...x, id: uid('care') }));
    if (t.procedureCodes) {
      t.procedureCodes.forEach(({ code, quantity }) => {
        const price = findPrice(code);
        if (price && !P.proceduresAndLabs.some((p) => p.serviceCode === code)) {
          P.proceduresAndLabs.push({ id: uid('pr'), serviceCode: code, name: price.name, category: price.defaultCategory, quantity, unitPrice: price.price, source: 'AUTO_FROM_SOAP' });
        }
      });
      markCartChanged(s);
    }
    if (t.followUpDays) P.followUpDays = t.followUpDays;
    if (t.recommendations) P.generalRecommendations = t.recommendations;
    if (s.status === 'WAITING') s.status = 'IN_PROGRESS';
  });
}

/** Шаблон тоже проходит CDSS: препараты из шаблона проверяются на аллергию, беременность и взаимодействия. */
export async function applyTemplateWithCdss(t: NosologyTemplate) {
  applyTemplate(t);
  const s = encounter.get();
  const items = [
    ...s.soap.plan.topicalTherapy.map((x) => ({ list: 'topicalTherapy' as const, id: x.id, name: x.drugName })),
    ...s.soap.plan.systemicTherapy.map((x) => ({ list: 'systemicTherapy' as const, id: x.id, name: x.drugName })),
  ].filter((x) => x.name);
  for (const it of items) {
    const others = items.filter((o) => o.id !== it.id).map((o) => o.name);
    const alerts = await cdssCheck(s.encounterId, it.name, others, s.patient);
    if (alerts.some((a) => a.level === 'BLOCKING_ALERT')) {
      ui.set((u) => { u.cdss = { alerts, drugName: it.name, target: { list: it.list, id: it.id } }; });
      return;
    }
  }
}

// ---------------- Биллинг ----------------
function markCartChanged(s: EncounterState) {
  if (s.billing.status === 'SENT_TO_CASHIER') s.billing.status = 'UPDATED_AFTER_SEND';
}

export function addService(price: PriceEntry, category: BillingCategory = price.defaultCategory, source: ProcedureItem['source'] = 'MANUAL', quantity = 1) {
  encounter.set((s) => {
    const existing = s.soap.plan.proceduresAndLabs.find((p) => p.serviceCode === price.code && p.category === category);
    if (existing) existing.quantity += quantity;
    else s.soap.plan.proceduresAndLabs.push({ id: uid('pr'), serviceCode: price.code, name: price.name, category, quantity, unitPrice: price.price, source, ...(price.note ? { priceNote: price.note } : {}) });
    markCartChanged(s);
  });
}

/** Цена услуги вручную (диапазон «от–до», цена в долларах или услуги нет в прайсе). */
export function setServicePrice(id: string, unitPrice: number) {
  encounter.set((s) => {
    const it = s.soap.plan.proceduresAndLabs.find((p) => p.id === id);
    if (!it) return;
    it.unitPrice = Math.max(0, Math.round(unitPrice));
    markCartChanged(s);
  });
}

export function setServiceQty(id: string, quantity: number) {
  encounter.set((s) => {
    const items = s.soap.plan.proceduresAndLabs;
    const it = items.find((p) => p.id === id);
    if (!it) return;
    if (quantity <= 0) s.soap.plan.proceduresAndLabs = items.filter((p) => p.id !== id);
    else it.quantity = quantity;
    markCartChanged(s);
  });
}

export function setServiceCategory(id: string, category: BillingCategory) {
  encounter.set((s) => {
    const it = s.soap.plan.proceduresAndLabs.find((p) => p.id === id);
    if (it) it.category = category;
    markCartChanged(s);
  });
}

export function cartTotals(s: EncounterState) {
  const items = s.soap.plan.proceduresAndLabs;
  const k = 1 - s.billing.discountPercent / 100;
  const sum = (cat: BillingCategory) => items.filter((i) => i.category === cat).reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const rendered = sum('RENDERED');
  const prescribed = sum('PRESCRIBED');
  return { rendered, prescribed, renderedFinal: rendered * k, prescribedFinal: prescribed * k };
}

// ---------------- Автосохранение (debounce 2000 мс, SPEC §3.1) ----------------
const DRAFT_KEY = () => `draft:${encounter.get().encounterId}`;
type Persisted = Pick<EncounterState, 'soap' | 'markers' | 'billing' | 'docs' | 'draftVersion' | 'status'>;

let timer: ReturnType<typeof setTimeout> | undefined;
let lastRefs: unknown[] = [];
let lastSig = '';
let autosaveStarted = false;
const sig = (s: EncounterState) => JSON.stringify([s.soap, s.markers, s.billing, s.docs]);

/** После загрузки визита с сервера: текущее состояние считается сохраненным. */
export function resetAutosaveBaseline() {
  clearTimeout(timer);
  const s = encounter.get();
  lastRefs = [s.soap, s.markers, s.billing, s.docs];
  lastSig = sig(s);
}

const pick = (s: EncounterState): Persisted => ({
  soap: s.soap, markers: s.markers, billing: s.billing, docs: s.docs, draftVersion: s.draftVersion, status: s.status,
});

let inflight: Promise<void> | null = null;

/** Сохранения выполняются строго последовательно: иначе два PATCH с одним If-Match дают 409. */
export async function flushSave() {
  clearTimeout(timer);
  while (inflight) await inflight;
  inflight = doSave();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

async function doSave() {
  const s = encounter.get();
  const payload = pick(s);
  await idbPut(DRAFT_KEY(), { ...payload, savedLocallyAt: Date.now() });
  if (!navigator.onLine) {
    encounter.set((d) => { d.saveState = 'offline'; });
    return;
  }
  encounter.set((d) => { d.saveState = 'saving'; });
  let res: Awaited<ReturnType<typeof patchDraft>>;
  try {
    res = await patchDraft(s.encounterId, s.draftVersion, payload);
  } catch {
    encounter.set((d) => { d.saveState = 'offline'; });
    return;
  }
  if (encounter.get().encounterId !== s.encounterId) return; // врач уже открыл другой визит
  encounter.set((d) => {
    if (res.ok) {
      d.draftVersion = res.draft_version;
      d.savedAt = res.saved_at;
      d.saveState = 'saved';
    } else {
      d.saveState = 'conflict';
    }
  });
}

export function startAutosave() {
  if (autosaveStarted) return;
  autosaveStarted = true;
  lastSig = sig(encounter.get());
  encounter.subscribe(() => {
    const s = encounter.get();
    const refs = [s.soap, s.markers, s.billing, s.docs];
    if (refs.every((r, i) => r === lastRefs[i])) return;
    lastRefs = refs;
    // structuredClone в set() меняет ссылки всех веток — сравниваем содержимое
    const next = sig(s);
    if (next === lastSig) return;
    lastSig = next;
    if (s.saveState !== 'pending' && s.saveState !== 'offline') queueMicrotask(() => encounter.set((d) => { d.saveState = 'pending'; }));
    clearTimeout(timer);
    timer = setTimeout(flushSave, server.config?.realtime === 'poll' ? 4000 : 2000); // в облаке реже: каждая запись платная
  });

  const onNet = () => {
    ui.set((u) => { u.online = navigator.onLine; });
    if (navigator.onLine && encounter.get().saveState === 'offline') flushSave();
  };
  window.addEventListener('online', onNet);
  window.addEventListener('offline', () => {
    onNet();
    encounter.set((d) => { d.saveState = 'offline'; });
  });
}

/** Восстановление черновика после обрыва связи / закрытия вкладки. */
export async function restoreDraft(newerThan = 0) {
  const saved = await idbGet<Persisted & { savedLocallyAt?: number }>(DRAFT_KEY());
  if (!saved || (saved.savedLocallyAt ?? 0) <= newerThan) return false;
  encounter.set((s) => {
    s.soap = saved.soap;
    s.markers = saved.markers;
    s.billing = saved.billing;
    s.docs = saved.docs;
    s.status = saved.status;
  });
  return true;
}


// ---------------- Загрузка визита и realtime ----------------
let currentRoom: string | null = null;

export async function refreshMedia() {
  if (!server.online) return;
  const items = await fetchPatientMedia(encounter.get().patient.id);
  media.set((m) => { m.items = items; });
}

/** Открыть визит: сервер → стор; при наличии более свежего локального черновика (офлайн-правки) — он. */
export async function openEncounter(id: string) {
  ui.set((u) => { u.loading = true; u.loadError = null; u.lightbox = false; u.deliveryErrors = {}; });
  if (!server.online) {
    if (!media.get().items.length) seedDemoMedia();
    await restoreDraft();
    resetAutosaveBaseline();
    ui.set((u) => { u.loading = false; });
    startAutosave();
    return;
  }
  try {
    const data = await fetchEncounter(id);
    encounter.replace({ ...data.encounter, saveState: 'saved', completionErrors: [] });
    media.set((m) => {
      m.items = data.media;
      m.selectedMarker = data.encounter.markers.find((mk) => data.media.some((x) => x.markerId === mk.id))?.id ?? data.encounter.markers[0]?.id ?? null;
    });
    ui.set((u) => { u.isoHistoryMg = data.isotretinoinHistoryMg; });
    resetAutosaveBaseline();
    const restored = await restoreDraft(Date.parse(data.updatedAt));
    startAutosave();
    if (restored) await flushSave();
    if (currentRoom) leaveRoom(currentRoom);
    currentRoom = `encounter:${id}`;
    joinRoom(currentRoom);
  } catch (e) {
    ui.set((u) => { u.loadError = (e as Error).message; });
  } finally {
    ui.set((u) => { u.loading = false; });
  }
}

let weightTimer: ReturnType<typeof setTimeout> | undefined;
export function setPatientWeight(kg: number) {
  encounter.set((s) => { s.patient.weightKg = kg; });
  clearTimeout(weightTimer);
  weightTimer = setTimeout(() => void updatePatient(encounter.get().patient.id, { weightKg: kg }), 800);
}

export async function markConsentSigned() {
  const p = encounter.get().patient;
  await updatePatient(p.id, { communicationConsent: true });
  encounter.set((s) => { s.patient.communicationConsent = true; });
}

let handlersReady = false;
export function initRealtime() {
  if (handlersReady || !server.online) return;
  handlersReady = true;
  startRealtime();
  onEvent('MEDIA_ADDED', async (p: { marker_id: string | null; source: string }) => {
    await refreshMedia();
    if (p.marker_id) media.set((m) => { m.selectedMarker = p.marker_id; });
    if (p.source === 'MOBILE_QR') {
      ui.set((u) => { u.qr = null; });
      toast('Снимок со смартфона добавлен в карту', 'success');
    }
  });
  onEvent('DELIVERY_STATUS', (p: { channel: Channel; status: DeliveryStatus; error?: string | null }) => {
    encounter.set((s) => { s.delivery[p.channel] = p.status; });
    ui.set((u) => {
      if (p.status === 'FAILED' && p.error) u.deliveryErrors[p.channel] = p.error;
      else delete u.deliveryErrors[p.channel];
    });
  });
  onEvent('BILLING_PAID', () => {
    encounter.set((s) => { s.billing.status = 'PAID'; });
    toast('Счет оплачен на кассе', 'success');
  });
}
