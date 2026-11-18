import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import { db, saveDb, type CartRec, type DeliveryRec, type DocRec, type EncounterRec, type MediaRec } from './db';
import { html, HttpError, json, readBody, readJson, route, sendFile } from './http';
import { emit } from './realtime';
import { audit, checkPresigned, newId, presign, signToken, verifyToken } from './security';
import { sniffMime, stripMetadata } from './exif';
import { browserPath, htmlToPdf } from './pdf';
import { DOC_TITLES, docTypesFor, renderDocHtml, type DocType } from './render';
import { channelMode, onWhatsAppStatus, runDelivery } from './gateways';
import { mobileUploadPage, verifyPage } from './pages';
import { qrSvg } from '../../src/lib/qr';
import { checkDrug } from '../../src/lib/cdss';
import { findDrug } from '../../src/data/drugs';
import { applyDictionaries, type Dictionaries } from '../../src/data/dictionaries';
import { createEmptySoap } from '../../src/data/mockEncounter';
import { verificationHash, CLINIC } from '../../src/components/documents/Documents';
import { formatAge } from '../../src/lib/calculators';
import type { Channel, EncounterState, HistoryItem, Patient } from '../../src/types';
import type { MediaItem } from '../../src/components/left/media';

// ---------- помощники ----------
const findEncounter = (id: string) => {
  const e = db().encounters.find((x) => x.id === id);
  if (!e) throw new HttpError(404, 'Визит не найден');
  return e;
};
const findPatient = (id: string) => {
  const p = db().patients.find((x) => x.id === id);
  if (!p) throw new HttpError(404, 'Пациент не найден');
  return p;
};
const initials = (name: string) => {
  const [last, first, middle] = name.split(' ');
  return `${last} ${first?.[0] ?? ''}.${middle ? ` ${middle[0]}.` : ''}`;
};
const isDone = (e: EncounterRec) => e.status === 'COMPLETED' || e.status === 'SIGNED';

function previousFor(e: EncounterRec) {
  const prev = db().encounters
    .filter((x) => x.patientId === e.patientId && x.id !== e.id && isDone(x) && x.createdAt < e.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!prev) return null;
  const d = prev.soap.assessment.primaryDiagnosis;
  return {
    date: prev.createdAt.slice(0, 10),
    diagnosis: `${d.icd10Code} ${d.icd10Name}${d.stage === 'PROGRESSIVE' ? ', прогрессирующая стадия' : ''}`.trim(),
    anamnesisMorbi: prev.soap.subjective.anamnesisMorbi,
    anamnesisVitae: prev.soap.subjective.anamnesisVitae,
    previousTherapySummary: prev.soap.subjective.previousTherapySummary,
  };
}

function historyFor(e: EncounterRec): HistoryItem[] {
  const visits: HistoryItem[] = db().encounters
    .filter((x) => x.patientId === e.patientId && x.id !== e.id && isDone(x))
    .map((x) => {
      const d = x.soap.assessment.primaryDiagnosis;
      const calc = Object.entries(x.soap.assessment.calculators).map(([k, v]) => `${k} ${v?.score}`).join(' · ');
      return {
        date: x.createdAt.slice(0, 10),
        kind: 'visit',
        title: `${x.appointmentType === 'PRIMARY' ? 'Первичный' : 'Повторный'} прием · ${d.icd10Code || 'без диагноза'}`,
        note: [calc, x.soap.plan.generalRecommendations].filter(Boolean).join(' · '),
      };
    });
  return [...visits, ...(db().labs[e.patientId] ?? [])].sort((a, b) => b.date.localeCompare(a.date));
}

/** Кумулятивная доза изотретиноина по прошлым визитам (PRD §4.3.1 P). */
function isotretinoinHistoryMg(e: EncounterRec): number {
  return db().encounters
    .filter((x) => x.patientId === e.patientId && x.id !== e.id && isDone(x))
    .flatMap((x) => x.soap.plan.systemicTherapy)
    .filter((s) => findDrug(s.drugName)?.inn === 'isotretinoin')
    .reduce((sum, s) => sum + (s.dailyDoseMg ?? 0) * s.durationDays, 0);
}

const docUrl = (d: DocRec) => presign(`/api/v1/documents/${d.id}/file`);
const docsFor = (e: EncounterRec) =>
  db().documents.filter((d) => d.encounterId === e.id).map((d) => ({ id: d.id, docType: d.docType, url: docUrl(d), verificationHash: d.verificationHash, generatedAt: d.generatedAt, format: d.format }));

function deliveryFor(e: EncounterRec): EncounterState['delivery'] {
  const out: EncounterState['delivery'] = { PATIENT_PORTAL: 'IDLE', TELEGRAM: 'IDLE', WHATSAPP: 'IDLE', MAX: 'IDLE' };
  db().deliveries.filter((d) => d.encounterId === e.id).forEach((d) => (out[d.channel] = d.status));
  return out;
}

export function buildState(e: EncounterRec): EncounterState {
  const patient = findPatient(e.patientId);
  return {
    encounterId: e.id,
    appointmentType: e.appointmentType,
    history: historyFor(e),
    previousVisit: previousFor(e),
    documents: docsFor(e),
    status: e.status,
    startedAt: e.startedAt ?? Date.now(),
    draftVersion: e.draftVersion,
    savedAt: e.updatedAt,
    saveState: 'saved',
    patient,
    soap: e.soap,
    markers: e.markers,
    activeProjection: 'FRONT',
    billing: e.billing,
    docs: e.docs,
    delivery: deliveryFor(e),
    completionErrors: [],
  };
}

const mediaUrl = (m: MediaRec) => presign(`/media/${m.id}`);
const mediaDto = (m: MediaRec): MediaItem & { source: string; encounterId: string } => ({
  id: m.id, markerId: m.markerId, date: m.date, kind: m.mediaType === 'DERMATOSCOPY' ? 'DERMATOSCOPY' : 'MACRO_PHOTO',
  url: mediaUrl(m), includeInPdf: m.includeInPdf, source: m.source, encounterId: m.encounterId,
});
const mediaForPatient = (patientId: string) => db().media.filter((m) => m.patientId === patientId).sort((a, b) => a.date.localeCompare(b.date));

function validateCompletion(e: EncounterRec): string[] {
  const errors: string[] = [];
  if (!e.soap.assessment.primaryDiagnosis.icd10Code) errors.push('Не указан основной диагноз по МКБ-10');
  if (!e.soap.objective.statusLocalis.trim() && !e.soap.objective.localizationText.trim()) errors.push('Не заполнен Status Localis');
  return errors;
}

function storeMedia(buf: Buffer, declaredMime: string | undefined, e: EncounterRec, markerId: string | null, kind: string, source: MediaRec['source']) {
  if (!buf.length) throw new HttpError(400, 'Пустой файл');
  const mime = sniffMime(buf) ?? declaredMime ?? '';
  if (!['image/jpeg', 'image/png', 'image/heic', 'image/webp'].includes(mime)) throw new HttpError(415, 'Поддерживаются JPEG, PNG, HEIC, WebP');
  const clean = stripMetadata(buf, mime);
  const id = newId('media');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' }[mime]!;
  writeFileSync(resolve(config.dataDir, 'media', `${id}.${ext}`), clean);
  const rec: MediaRec = {
    id, encounterId: e.id, patientId: e.patientId, markerId: markerId && e.markers.some((m) => m.id === markerId) ? markerId : null,
    mediaType: kind === 'DERMATOSCOPY' ? 'DERMATOSCOPY' : kind === 'TRICHOSCOPY' ? 'TRICHOSCOPY' : 'MACRO_PHOTO',
    file: `${id}.${ext}`, mime, includeInPdf: true, date: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), source,
  };
  db().media.push(rec);
  saveDb();
  // SPEC §3.2: WS Event MEDIA_ADDED
  emit(`encounter:${e.id}`, 'MEDIA_ADDED', { media_id: rec.id, thumb_url: mediaUrl(rec), marker_id: rec.markerId, source });
  return rec;
}

// ---------- маршруты ----------
export function registerRoutes() {
  route('GET', '/api/v1/health', (_req, res) => json(res, 200, { ok: true }));

  route('GET', '/api/v1/config', (_req, res) =>
    json(res, 200, {
      publicUrl: config.publicUrl,
      pdfEngine: browserPath() ? 'chromium' : 'none',
      channels: { PATIENT_PORTAL: 'live', TELEGRAM: channelMode('TELEGRAM'), WHATSAPP: channelMode('WHATSAPP'), MAX: channelMode('MAX') },
      clinic: CLINIC,
    }),
  );

  // --- Очередь, пациенты, визиты ---
  route('GET', '/api/v1/encounters', (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const list = db().encounters
      .filter((e) => !isDone(e) || e.updatedAt.slice(0, 10) === today)
      .map((e) => {
        const p = findPatient(e.patientId);
        return {
          id: e.id, status: e.status, appointmentType: e.appointmentType, startedAt: e.startedAt, updatedAt: e.updatedAt,
          patient: { id: p.id, fullName: p.fullName, sex: p.sex, age: formatAge(p.birthDate), cardNumber: p.cardNumber, allergies: p.allergies, isPregnantOrLactating: p.isPregnantOrLactating },
          diagnosis: e.soap.assessment.primaryDiagnosis.icd10Code ? `${e.soap.assessment.primaryDiagnosis.icd10Code} ${e.soap.assessment.primaryDiagnosis.icd10Name}` : '',
        };
      });
    json(res, 200, list);
  });

  route('POST', '/api/v1/patients', async (req, res) => {
    const b = await readJson<Partial<Patient> & { allergiesText?: string }>(req);
    if (!b.fullName?.trim() || !b.birthDate) throw new HttpError(422, 'Укажите ФИО и дату рождения');
    if (b.phone && !/^\+[1-9]\d{7,14}$/.test(b.phone)) throw new HttpError(422, 'Телефон в формате E.164: +79991234567');
    const seq = String(db().patients.length + 9200).padStart(5, '0');
    const patient: Patient = {
      id: newId('pat'), fullName: b.fullName.trim(), sex: b.sex === 'M' ? 'M' : 'F', birthDate: b.birthDate,
      cardNumber: `АК-${new Date().getFullYear()}/${seq}`, fitzpatrick: b.fitzpatrick ?? 'II', weightKg: Number(b.weightKg) || 70,
      allergies: b.allergies ?? [], isPregnantOrLactating: !!b.isPregnantOrLactating, activeRetinoids: !!b.activeRetinoids,
      communicationConsent: !!b.communicationConsent, phone: b.phone ?? '', telegramLinked: false, telegramChatId: null, maxUserId: null,
    };
    db().patients.push(patient);
    const now = new Date().toISOString();
    const soap = createEmptySoap();
    soap.plan.proceduresAndLabs.push({ id: newId('pr'), serviceCode: 'B01.008.001', name: 'Прием врача-дерматовенеролога первичный', category: 'RENDERED', quantity: 1, unitPrice: 3500, source: 'MANUAL' });
    const enc: EncounterRec = {
      id: newId('enc'), patientId: patient.id, doctorId: 'doc_sokolova', appointmentType: 'PRIMARY', status: 'WAITING', startedAt: null,
      completedAt: null, draftVersion: 1, soap, markers: [], billing: { status: 'DRAFT', payerType: 'CASH', discountPercent: 0, sentAt: null },
      docs: { summary: true, attachDermatoscopy: true, prescriptions: true, memo: true, estimate: false }, previousVisit: null, createdAt: now, updatedAt: now,
    };
    db().encounters.push(enc);
    saveDb();
    audit('CREATE_PATIENT', patient.id, req.ip);
    json(res, 201, { patientId: patient.id, encounterId: enc.id });
  });

  route('PATCH', '/api/v1/patients/:id', async (req, res) => {
    const p = findPatient(req.params.id);
    const b = await readJson<Partial<Patient>>(req);
    const allowed: (keyof Patient)[] = ['weightKg', 'communicationConsent', 'isPregnantOrLactating', 'activeRetinoids', 'allergies', 'phone', 'fitzpatrick'];
    allowed.forEach((k) => { if (b[k] !== undefined) (p as unknown as Record<string, unknown>)[k] = b[k]; });
    saveDb();
    json(res, 200, p);
  });

  route('POST', '/api/v1/encounters/:id/new-visit', (req, res) => {
    // повторный прием того же пациента
    const prev = findEncounter(req.params.id);
    const now = new Date().toISOString();
    const enc: EncounterRec = { ...structuredClone(prev), id: newId('enc'), appointmentType: 'FOLLOW_UP', status: 'WAITING', startedAt: null, completedAt: null, draftVersion: 1, soap: createEmptySoap(), markers: [], billing: { status: 'DRAFT', payerType: 'CASH', discountPercent: 0, sentAt: null }, createdAt: now, updatedAt: now };
    db().encounters.push(enc);
    saveDb();
    json(res, 201, { encounterId: enc.id });
  });

  route('GET', '/api/v1/encounters/:id', (req, res) => {
    const e = findEncounter(req.params.id);
    audit('OPEN_CARD', e.id, req.ip);
    json(res, 200, { encounter: buildState(e), media: mediaForPatient(e.patientId).map(mediaDto), isotretinoinHistoryMg: isotretinoinHistoryMg(e), updatedAt: e.updatedAt });
  });

  // SPEC §3.1: автосохранение с optimistic locking
  route('PATCH', '/api/v1/encounters/:id/draft', async (req, res) => {
    const e = findEncounter(req.params.id);
    const ifMatch = Number(req.headers['if-match']);
    if (!Number.isFinite(ifMatch) || ifMatch !== e.draftVersion) {
      return json(res, 409, { error: 'Запись изменена в другой вкладке или на другом устройстве', draft_version: e.draftVersion });
    }
    if (isDone(e) && e.status === 'SIGNED') throw new HttpError(423, 'Протокол подписан и не редактируется');
    const b = await readJson<Partial<EncounterRec>>(req);
    if (b.soap) e.soap = b.soap;
    if (b.markers) e.markers = b.markers;
    if (b.docs) e.docs = b.docs;
    if (b.billing) {
      const wasSent = e.billing.status !== 'DRAFT';
      e.billing = { ...e.billing, payerType: b.billing.payerType, discountPercent: b.billing.discountPercent };
      if (wasSent && b.billing.status === 'UPDATED_AFTER_SEND') e.billing.status = 'UPDATED_AFTER_SEND';
    }
    if (e.status === 'WAITING') { e.status = 'IN_PROGRESS'; e.startedAt = Date.now(); }
    e.draftVersion += 1;
    e.updatedAt = new Date().toISOString();
    saveDb();
    json(res, 200, { draft_version: e.draftVersion, saved_at: e.updatedAt });
  });

  route('POST', '/api/v1/encounters/:id/status', async (req, res) => {
    const e = findEncounter(req.params.id);
    const { status } = await readJson<{ status: EncounterRec['status'] }>(req);
    if (status === 'IN_PROGRESS' && !e.startedAt) e.startedAt = Date.now();
    if (status === 'WAITING' || status === 'IN_PROGRESS') e.status = status;
    e.updatedAt = new Date().toISOString();
    saveDb();
    json(res, 200, { status: e.status, startedAt: e.startedAt });
  });

  route('POST', '/api/v1/encounters/:id/complete', (req, res) => {
    const e = findEncounter(req.params.id);
    const errors = validateCompletion(e);
    if (errors.length) throw new HttpError(422, 'Не заполнены обязательные поля', errors);
    e.status = 'COMPLETED';
    e.completedAt = new Date().toISOString();
    e.updatedAt = e.completedAt;
    saveDb();
    audit('COMPLETE_ENCOUNTER', e.id, req.ip);
    json(res, 200, { status: e.status, completedAt: e.completedAt });
  });

  // --- Справочники и шаблоны ---
  route('GET', '/api/v1/dictionaries', (_req, res) => json(res, 200, db().dictionaries));

  route('GET', '/api/v1/templates', (req, res) => {
    const d = db().dictionaries as unknown as Dictionaries;
    const group = req.query.get('nosology_group');
    const q = (req.query.get('search') ?? '').toLowerCase();
    json(res, 200, {
      templates: d.templates.filter((t) => (!group || String(t.group) === group) && (!q || t.title.toLowerCase().includes(q) || t.icd10Code.toLowerCase().startsWith(q))),
      macros: d.macros.filter((m) => !q || m.key.startsWith(q) || m.title.toLowerCase().includes(q)),
    });
  });

  // --- CDSS (SPEC §3.3) ---
  route('POST', '/api/v1/cdss/check', async (req, res) => {
    const b = await readJson<{ encounter_id: string; drug_name: string; current_drugs?: string[] }>(req);
    const e = findEncounter(b.encounter_id);
    const patient = findPatient(e.patientId);
    const alerts = checkDrug(b.drug_name, patient, b.current_drugs ?? []);
    json(res, 200, { alerts, isotretinoin: { historyMg: isotretinoinHistoryMg(e), targetMinMg: Math.round(patient.weightKg * 120), targetMaxMg: Math.round(patient.weightKg * 150) } });
  });

  // --- Медиа ---
  route('GET', '/api/v1/patients/:id/media', (req, res) => json(res, 200, mediaForPatient(req.params.id).map(mediaDto)));

  route('POST', '/api/v1/encounters/:id/media', async (req, res) => {
    const e = findEncounter(req.params.id);
    const buf = await readBody(req, 25 * 1024 * 1024);
    const rec = storeMedia(buf, req.headers['content-type'], e, req.query.get('marker_id'), req.query.get('kind') ?? 'MACRO_PHOTO', 'DESKTOP');
    json(res, 201, mediaDto(rec));
  });

  route('PATCH', '/api/v1/media/:id', async (req, res) => {
    const m = db().media.find((x) => x.id === req.params.id);
    if (!m) throw new HttpError(404, 'Снимок не найден');
    const b = await readJson<{ includeInPdf?: boolean; markerId?: string | null }>(req);
    if (b.includeInPdf !== undefined) m.includeInPdf = b.includeInPdf;
    if (b.markerId !== undefined) m.markerId = b.markerId;
    saveDb();
    json(res, 200, mediaDto(m));
  });

  route('GET', '/media/:id', (req, res) => {
    if (!checkPresigned(req.path, req.query.get('exp'), req.query.get('sig'))) throw new HttpError(403, 'Ссылка истекла');
    const m = db().media.find((x) => x.id === req.params.id);
    const file = m && resolve(config.dataDir, 'media', m.file);
    if (!m || !file || !existsSync(file)) throw new HttpError(404, 'Файл не найден');
    sendFile(res, file, { mime: m.mime });
  });

  // --- QR-мост со смартфоном (SPEC §3.2) ---
  route('POST', '/api/v1/encounters/:id/qr-session', (req, res) => {
    const e = findEncounter(req.params.id);
    const token = signToken({ e: e.id }, config.qrTtlMs);
    const url = `${config.publicUrl}/m/upload?t=${token}`;
    json(res, 201, { token, url, expiresAt: Date.now() + config.qrTtlMs, svg: qrSvg(url, { color: '#19382C' }) });
  });

  route('GET', '/m/upload', (req, res) => html(res, 200, mobileUploadPage(req.query.get('t') ?? '')));

  route('GET', '/api/v1/m/session', (req, res) => {
    const t = verifyToken<{ e: string }>(req.query.get('t') ?? '');
    if (!t) throw new HttpError(401, 'Токен недействителен или истек');
    const e = findEncounter(t.e);
    const p = findPatient(e.patientId);
    json(res, 200, { patient: initials(p.fullName), doctor: CLINIC.doctor, markers: e.markers.map((m) => ({ id: m.id, number: m.number, label: m.anatomyLabel })) });
  });

  route('POST', '/api/v1/media/mobile-upload', async (req, res) => {
    const t = verifyToken<{ e: string }>(req.query.get('t') ?? '');
    if (!t) throw new HttpError(401, 'Токен недействителен или истек');
    const e = findEncounter(t.e);
    const buf = await readBody(req, 25 * 1024 * 1024);
    const rec = storeMedia(buf, req.headers['content-type'], e, req.query.get('marker_id') || null, req.query.get('kind') ?? 'MACRO_PHOTO', 'MOBILE_QR');
    json(res, 201, { media_id: rec.id });
  });

  // --- Биллинг и касса (SPEC §3.4, §6.1) ---
  route('POST', '/api/v1/encounters/:id/billing/sync', (req, res) => {
    const e = findEncounter(req.params.id);
    const p = findPatient(e.patientId);
    const k = 1 - (e.billing.discountPercent || 0) / 100;
    const items = e.soap.plan.proceduresAndLabs.map((i) => ({ ...i, finalPrice: Math.round(i.unitPrice * i.quantity * k * 100) / 100 }));
    const sum = (c: string) => items.filter((i) => i.category === c).reduce((s, i) => s + i.finalPrice, 0);
    let cart = db().carts.find((c) => c.encounterId === e.id);
    const isUpdate = !!cart && cart.status !== 'DRAFT';
    if (cart?.status === 'PAID') throw new HttpError(409, 'Счет уже оплачен и фискализирован');
    const next: CartRec = {
      id: cart?.id ?? newId('cart'), encounterId: e.id, patientName: p.fullName, status: isUpdate ? 'UPDATED_AFTER_SEND' : 'SENT_TO_CASHIER',
      payerType: e.billing.payerType, discountPercent: e.billing.discountPercent, items, totalRendered: sum('RENDERED'), totalPrescribed: sum('PRESCRIBED'),
      syncedAt: new Date().toISOString(), paidAt: null,
    };
    if (cart) Object.assign(cart, next); else db().carts.push((cart = next));
    e.billing.status = 'SENT_TO_CASHIER';
    e.billing.sentAt = next.syncedAt;
    saveDb();
    const event = isUpdate ? 'CASHIER_CART_UPDATED' : 'CASHIER_CART_RECEIVED';
    emit('cashier', event, cart);
    json(res, 200, { ok: true, event, cart });
  });

  route('GET', '/api/v1/cashier/carts', (_req, res) => json(res, 200, [...db().carts].sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))));

  route('POST', '/api/v1/cashier/carts/:id/pay', (req, res) => {
    const cart = db().carts.find((c) => c.id === req.params.id);
    if (!cart) throw new HttpError(404, 'Счет не найден');
    cart.status = 'PAID';
    cart.paidAt = new Date().toISOString();
    saveDb();
    audit('CART_PAID', cart.id, req.ip, 'cashier_demo');
    emit('cashier', 'CASHIER_CART_PAID', cart);
    emit(`encounter:${cart.encounterId}`, 'BILLING_PAID', { cartId: cart.id });
    json(res, 200, cart);
  });

  // --- Документы (SPEC §3.5, §5) ---
  route('POST', '/api/v1/encounters/:id/documents/generate', async (req, res) => {
    const e = findEncounter(req.params.id);
    const state = buildState(e);
    const hash = verificationHash(state);
    const photos: MediaItem[] = db().media
      .filter((m) => m.encounterId === e.id && m.includeInPdf)
      .map((m) => {
        const file = resolve(config.dataDir, 'media', m.file);
        const ok = existsSync(file) && (m.mime === 'image/jpeg' || m.mime === 'image/png' || m.mime === 'image/webp');
        return { ...mediaDto(m), url: ok ? `data:${m.mime};base64,${readFileSync(file).toString('base64')}` : '' };
      })
      .filter((m) => m.url);
    const engine = browserPath() ? 'pdf' : 'html';
    const generated: DocRec[] = [];
    const started = Date.now();
    // A4 и Mobile рендерятся параллельно в одном экземпляре Chromium (SPEC §7.1: ≤ 3 с)
    const results = await Promise.all((docTypesFor(state) as DocType[]).map(async (type) => {
      const page = renderDocHtml(type, state, photos, config.publicUrl);
      let format: 'pdf' | 'html' = engine;
      let buf: Buffer;
      if (engine === 'pdf') {
        try {
          buf = await htmlToPdf(page, type === 'SUMMARY_MOBILE' ? 'MOBILE' : 'A4');
        } catch (err) {
          console.warn('[pdf] fallback to HTML:', (err as Error).message);
          format = 'html';
          buf = Buffer.from(page);
        }
      } else buf = Buffer.from(page);
      return { type, format, buf };
    }));
    // предыдущая версия пакета этого визита заменяется целиком (атомарно, после рендера)
    db().documents = db().documents.filter((d) => d.encounterId !== e.id);
    for (const { type, format, buf } of results) {
      const id = newId('doc');
      writeFileSync(resolve(config.dataDir, 'documents', `${id}.${format}`), buf);
      const rec: DocRec = { id, encounterId: e.id, patientId: e.patientId, docType: type, file: `${id}.${format}`, format, verificationHash: hash, generatedAt: new Date().toISOString(), url: '' };
      db().documents.push(rec);
      generated.push(rec);
    }
    saveDb();
    audit('GENERATE_DOCUMENTS', e.id, req.ip);
    json(res, 200, {
      engine: generated.every((g) => g.format === 'pdf') ? 'chromium' : 'html-fallback',
      ms: Date.now() - started,
      verificationHash: hash,
      documents: generated.map((d) => ({ id: d.id, docType: d.docType, url: docUrl(d), verificationHash: d.verificationHash, generatedAt: d.generatedAt, format: d.format })),
    });
  });

  route('GET', '/api/v1/documents/:id/file', (req, res) => {
    if (!checkPresigned(req.path, req.query.get('exp'), req.query.get('sig'))) throw new HttpError(403, 'Ссылка истекла — сформируйте документы заново');
    const d = db().documents.find((x) => x.id === req.params.id);
    const file = d && resolve(config.dataDir, 'documents', d.file);
    if (!d || !file || !existsSync(file)) throw new HttpError(404, 'Документ не найден');
    audit('DOWNLOAD_PDF', d.id, req.ip);
    sendFile(res, file, { mime: d.format === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8', download: `${DOC_TITLES[d.docType]}.${d.format}` });
  });

  route('GET', '/verify/:hash', (req, res) => {
    const docs = db().documents.filter((d) => d.verificationHash === req.params.hash);
    if (!docs.length) return html(res, 404, verifyPage(null));
    const e = db().encounters.find((x) => x.id === docs[0].encounterId);
    const p = e && db().patients.find((x) => x.id === e.patientId);
    html(res, 200, verifyPage({
      patient: p ? initials(p.fullName) : '—',
      date: e ? new Date(e.startedAt ?? e.createdAt).toLocaleDateString('ru-RU') : '—',
      doctor: CLINIC.doctor,
      docs: docs.map((d) => DOC_TITLES[d.docType].replace(/_/g, ' ')),
      hash: req.params.hash,
    }));
  });

  route('POST', '/api/v1/encounters/:id/documents/dispatch', async (req, res) => {
    const e = findEncounter(req.params.id);
    const p = findPatient(e.patientId);
    const b = await readJson<{ channels: Channel[]; document_ids?: string[]; phone_override?: string | null }>(req);
    const requested = (b.document_ids ?? []).filter((id) => db().documents.some((d) => d.id === id && d.encounterId === e.id));
    const docIds = requested.length ? requested : db().documents.filter((d) => d.encounterId === e.id).map((d) => d.id);
    if (!docIds.length) throw new HttpError(422, 'Сначала сформируйте документы');
    const phone = b.phone_override || p.phone;
    const created: DeliveryRec[] = [];
    const rejected: { channel: Channel; reason: string }[] = [];
    for (const channel of b.channels ?? []) {
      // SPEC §6.2: блокировка мессенджеров без согласия на уровне бэкенда
      if (channel !== 'PATIENT_PORTAL' && !p.communicationConsent) { rejected.push({ channel, reason: 'Необходимо подписать согласие на ресепшене' }); continue; }
      if ((channel === 'WHATSAPP' || channel === 'MAX') && !/^\+[1-9]\d{7,14}$/.test(phone)) { rejected.push({ channel, reason: 'Нет телефона в формате E.164' }); continue; }
      const d: DeliveryRec = {
        id: newId('dlv'), encounterId: e.id, patientId: p.id, channel, recipientContact: channel === 'PATIENT_PORTAL' ? p.cardNumber : phone,
        consentVerified: p.communicationConsent, status: 'QUEUED', documentIds: docIds, externalMessageId: null, errorMessage: null, updatedAt: new Date().toISOString(),
      };
      db().deliveries.push(d);
      created.push(d);
      audit('DISPATCH', d.id, req.ip);
    }
    if (e.status === 'IN_PROGRESS' && !validateCompletion(e).length) { e.status = 'COMPLETED'; e.completedAt = new Date().toISOString(); }
    saveDb();
    created.forEach((d) => void runDelivery(d));
    json(res, rejected.length && !created.length ? 403 : 202, { deliveries: created.map((d) => ({ id: d.id, channel: d.channel, status: d.status, mode: channelMode(d.channel) })), rejected });
  });

  // --- Вебхуки мессенджеров (SPEC §6.3) ---
  route('GET', '/webhooks/whatsapp', (req, res) => {
    if (req.query.get('hub.verify_token') === config.whatsapp.verifyToken) { res.writeHead(200); res.end(req.query.get('hub.challenge') ?? ''); }
    else throw new HttpError(403, 'Неверный verify_token');
  });
  route('POST', '/webhooks/whatsapp', async (req, res) => {
    const b = await readJson<{ entry?: { changes?: { value?: { statuses?: { id: string; status: string; errors?: { title: string }[] }[] } }[] }[] }>(req);
    b.entry?.forEach((en) => en.changes?.forEach((c) => c.value?.statuses?.forEach((s) => onWhatsAppStatus(s.id, s.status, s.errors?.[0]?.title))));
    json(res, 200, { ok: true });
  });

  // --- Личный кабинет пациента ---
  route('GET', '/api/v1/portal/:patientId', (req, res) => {
    const p = findPatient(req.params.patientId);
    const records = db().portal.filter((r) => r.patientId === p.id).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const out = records.map((r) => {
      if (!r.readAt) {
        r.readAt = new Date().toISOString();
        const d = db().deliveries.filter((x) => x.encounterId === r.encounterId && x.channel === 'PATIENT_PORTAL' && x.status === 'DELIVERED');
        d.forEach((x) => { x.status = 'READ'; emit(`encounter:${x.encounterId}`, 'DELIVERY_STATUS', { channel: 'PATIENT_PORTAL', status: 'READ', deliveryId: x.id, mode: 'live' }); });
      }
      const e = db().encounters.find((x) => x.id === r.encounterId);
      return {
        encounterId: r.encounterId,
        publishedAt: r.publishedAt,
        diagnosis: e ? `${e.soap.assessment.primaryDiagnosis.icd10Code} ${e.soap.assessment.primaryDiagnosis.icd10Name}` : '',
        followUpDays: e?.soap.plan.followUpDays,
        prescribed: e?.soap.plan.proceduresAndLabs.filter((x) => x.category === 'PRESCRIBED').map((x) => x.name) ?? [],
        documents: db().documents.filter((d) => r.documentIds.includes(d.id)).map((d) => ({ id: d.id, docType: d.docType, title: DOC_TITLES[d.docType].replace(/_/g, ' '), url: docUrl(d), format: d.format })),
      };
    });
    saveDb();
    json(res, 200, { patient: { fullName: p.fullName, cardNumber: p.cardNumber }, records: out });
  });

  route('GET', '/api/v1/patients', (_req, res) =>
    json(res, 200, db().patients.map((p) => ({ id: p.id, fullName: p.fullName, cardNumber: p.cardNumber, age: formatAge(p.birthDate) }))),
  );
}

/** Подключает справочники из хранилища ко всему серверному коду (CDSS, шаблоны). */
export function applyStoredDictionaries() {
  applyDictionaries(db().dictionaries as unknown as Dictionaries);
}
