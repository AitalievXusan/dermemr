import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import { db, saveDb, type DeliveryRec, type DocRec } from './db';
import { emit } from './realtime';
import { newId } from './security';
import type { Channel, Patient } from '../../src/types';

// Омниканальная доставка (SPEC §6.2–6.3). Если токен канала не задан в .env —
// канал работает в режиме симуляции (статусы проходят те же стадии), чтобы проект
// полностью работал локально без внешних аккаунтов.

type Status = DeliveryRec['status'];

export const channelMode = (ch: Channel): 'live' | 'simulation' => {
  if (ch === 'PATIENT_PORTAL') return 'live';
  if (ch === 'TELEGRAM') return config.telegram.token ? 'live' : 'simulation';
  if (ch === 'WHATSAPP') return config.whatsapp.token && config.whatsapp.phoneNumberId ? 'live' : 'simulation';
  return config.max.token ? 'live' : 'simulation';
};

export function setStatus(d: DeliveryRec, status: Status, extra: Partial<DeliveryRec> = {}) {
  Object.assign(d, extra, { status, updatedAt: new Date().toISOString() });
  saveDb();
  emit(`encounter:${d.encounterId}`, 'DELIVERY_STATUS', {
    channel: d.channel, status, deliveryId: d.id, error: d.errorMessage, mode: channelMode(d.channel),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const docFile = (doc: DocRec) => readFileSync(resolve(config.dataDir, 'documents', doc.file));
const dateTag = () => new Date().toLocaleDateString('ru-RU').replace(/\./g, '_');
const fileName = (doc: DocRec) =>
  `${doc.docType === 'SUMMARY_MOBILE' || doc.docType === 'SUMMARY_DESKTOP_A4' ? 'Заключение_Дерматолог' : doc.docType === 'PATIENT_MEMO' ? 'Памятка' : doc.docType === 'ESTIMATE' ? 'Смета' : 'Рецепт'}_${dateTag()}.${doc.format}`;

/** Для мессенджеров отправляем Mobile PDF + рецепты + памятку (без A4-копии). */
const messengerDocs = (docs: DocRec[]) => docs.filter((d) => d.docType !== 'SUMMARY_DESKTOP_A4');

function linkToken(patientId: string, channel: 'TELEGRAM' | 'MAX', deliveryId: string) {
  const token = newId('lnk').slice(4, 16);
  db().linkTokens.push({ token, patientId, channel, deliveryId, createdAt: new Date().toISOString() });
  saveDb();
  return token;
}

// ---------------- Telegram Bot API ----------------
let tgUsername = '';
async function tg(method: string, body: FormData | Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${method}`, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) throw new Error(`Telegram: ${json.description}`);
  return json.result as Record<string, unknown>;
}

async function sendTelegram(d: DeliveryRec, patient: Patient, docs: DocRec[]) {
  if (!patient.telegramChatId) {
    const token = linkToken(patient.id, 'TELEGRAM', d.id);
    const link = `https://t.me/${tgUsername || 'ClinicBot'}?start=doc_${token}`;
    setStatus(d, 'FAILED', { errorMessage: `Пациент не привязан к боту. Отправьте ему ссылку: ${link} — документы придут автоматически.` });
    return;
  }
  const list = messengerDocs(docs);
  for (const [i, doc] of list.entries()) {
    const form = new FormData();
    form.append('chat_id', String(patient.telegramChatId));
    form.append('document', new Blob([docFile(doc)], { type: doc.format === 'pdf' ? 'application/pdf' : 'text/html' }), fileName(doc));
    if (i === 0) form.append('caption', 'Ваше заключение после приема дерматолога. План лечения — по времени суток.');
    if (i === list.length - 1)
      form.append('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: 'Записаться на повторный прием', url: config.bookingUrl }]] }));
    const msg = await tg('sendDocument', form);
    if (i === 0) setStatus(d, 'SENT', { externalMessageId: String(msg.message_id ?? '') });
  }
  setStatus(d, 'DELIVERED'); // Bot API не сообщает о прочтении
}

/** Long polling: локальный компьютер не принимает вебхуки из интернета. */
async function telegramPoller() {
  try {
    const me = await tg('getMe', {});
    tgUsername = String(me.username ?? '');
    console.log(`  Telegram: бот @${tgUsername} подключен`);
  } catch (e) {
    console.warn('  Telegram: не удалось подключиться —', (e as Error).message);
    return;
  }
  let offset = 0;
  for (;;) {
    try {
      const updates = (await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] })) as unknown as {
        update_id: number; message?: { chat: { id: number }; text?: string };
      }[];
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message?.text?.match(/^\/start doc_(\w+)/);
        if (m && u.message) await onLinked('TELEGRAM', m[1], String(u.message.chat.id));
      }
    } catch {
      await sleep(5000);
    }
  }
}

// ---------------- WhatsApp Business (Cloud API) ----------------
async function sendWhatsApp(d: DeliveryRec, patient: Patient, docs: DocRec[]) {
  const { token, phoneNumberId, apiVersion, template, language } = config.whatsapp;
  const base = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`;
  const mobile = docs.find((x) => x.docType === 'SUMMARY_MOBILE') ?? docs[0];
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([docFile(mobile)], { type: 'application/pdf' }), fileName(mobile));
  const up = await fetch(`${base}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const media = (await up.json()) as { id?: string; error?: { message: string } };
  if (!media.id) throw new Error(`WhatsApp media: ${media.error?.message ?? up.status}`);
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: patient.phone.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: template,
        language: { code: language },
        components: [{ type: 'header', parameters: [{ type: 'document', document: { id: media.id, filename: fileName(mobile) } }] }],
      },
    }),
  });
  const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
  if (!json.messages?.[0]) throw new Error(`WhatsApp: ${json.error?.message ?? res.status}`);
  setStatus(d, 'SENT', { externalMessageId: json.messages[0].id });
  // DELIVERED / READ приходят вебхуком /webhooks/whatsapp
}

export function onWhatsAppStatus(externalId: string, status: string, error?: string) {
  const d = db().deliveries.find((x) => x.externalMessageId === externalId);
  if (!d) return;
  const map: Record<string, Status> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
  if (map[status]) setStatus(d, map[status], error ? { errorMessage: error } : {});
}

// ---------------- MAX Bot API ----------------
let maxUsername = '';
async function maxApi(path: string, init: RequestInit = {}) {
  const res = await fetch(`${config.max.apiUrl}${path}`, {
    ...init,
    headers: { Authorization: config.max.token, ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`MAX ${path}: ${String(json.message ?? res.status)}`);
  return json;
}

async function sendMax(d: DeliveryRec, patient: Patient, docs: DocRec[]) {
  if (!patient.maxUserId) {
    const token = linkToken(patient.id, 'MAX', d.id);
    const link = `https://max.ru/${maxUsername || 'clinic_bot'}?start=doc_${token}`;
    setStatus(d, 'FAILED', { errorMessage: `Пациент не начал диалог с ботом MAX. Отправьте ему ссылку: ${link}` });
    return;
  }
  const attachments: { type: 'file'; payload: { token: string } }[] = [];
  for (const doc of messengerDocs(docs)) {
    const slot = (await maxApi('/uploads?type=file', { method: 'POST' })) as { url: string };
    const form = new FormData();
    form.append('data', new Blob([docFile(doc)], { type: 'application/pdf' }), fileName(doc));
    const up = await fetch(slot.url, { method: 'POST', body: form });
    const file = (await up.json()) as { token?: string };
    if (!file.token) throw new Error('MAX: не получен токен файла');
    attachments.push({ type: 'file', payload: { token: file.token } });
  }
  const body = JSON.stringify({
    text: 'Ваше заключение после приема дерматолога.',
    attachments: [...attachments, { type: 'inline_keyboard', payload: { buttons: [[{ type: 'link', text: 'Записаться на повторный прием', url: config.bookingUrl }]] } }],
  });
  for (let attempt = 0; ; attempt++) {
    try {
      const msg = (await maxApi(`/messages?user_id=${encodeURIComponent(patient.maxUserId)}`, { method: 'POST', body })) as { message?: { body?: { mid?: string } } };
      setStatus(d, 'SENT', { externalMessageId: msg.message?.body?.mid ?? null });
      setStatus(d, 'DELIVERED');
      return;
    } catch (e) {
      // файл еще обрабатывается на стороне MAX (attachment.not.ready) — повторяем
      if (attempt < 5 && /not.ready/i.test((e as Error).message)) await sleep(1500);
      else throw e;
    }
  }
}

async function maxPoller() {
  try {
    const me = (await maxApi('/me')) as { username?: string; name?: string };
    maxUsername = me.username ?? '';
    console.log(`  MAX: бот ${me.name ?? maxUsername} подключен`);
  } catch (e) {
    console.warn('  MAX: не удалось подключиться —', (e as Error).message);
    return;
  }
  let marker: number | undefined;
  for (;;) {
    try {
      const r = (await maxApi(`/updates?timeout=25&types=bot_started${marker ? `&marker=${marker}` : ''}`)) as {
        updates: { update_type: string; payload?: string; user?: { user_id: number } }[]; marker?: number;
      };
      marker = r.marker ?? marker;
      for (const u of r.updates ?? []) {
        const m = u.payload?.match(/^doc_(\w+)/);
        if (u.update_type === 'bot_started' && m && u.user) await onLinked('MAX', m[1], String(u.user.user_id));
      }
    } catch {
      await sleep(5000);
    }
  }
}

// ---------------- Общая логика ----------------
async function onLinked(channel: 'TELEGRAM' | 'MAX', token: string, externalUserId: string) {
  const link = db().linkTokens.find((l) => l.token === token && l.channel === channel);
  const patient = link && db().patients.find((p) => p.id === link.patientId);
  if (!link || !patient) return;
  if (channel === 'TELEGRAM') { patient.telegramChatId = externalUserId; patient.telegramLinked = true; }
  else patient.maxUserId = externalUserId;
  saveDb();
  const delivery = db().deliveries.find((x) => x.id === link.deliveryId);
  if (delivery) void runDelivery(delivery);
}

async function simulate(d: DeliveryRec) {
  setStatus(d, 'SENT');
  await sleep(1400);
  setStatus(d, 'DELIVERED');
  await sleep(2600);
  setStatus(d, 'READ');
}

export async function runDelivery(d: DeliveryRec) {
  const patient = db().patients.find((p) => p.id === d.patientId)!;
  const docs = db().documents.filter((x) => d.documentIds.includes(x.id));
  setStatus(d, 'QUEUED', { errorMessage: null });
  try {
    if (d.channel === 'PATIENT_PORTAL') {
      db().portal.push({ patientId: patient.id, encounterId: d.encounterId, documentIds: d.documentIds, publishedAt: new Date().toISOString(), readAt: null });
      setStatus(d, 'SENT');
      setStatus(d, 'DELIVERED'); // READ — когда пациент откроет Личный кабинет
      return;
    }
    if (channelMode(d.channel) === 'simulation') return await simulate(d);
    if (d.channel === 'TELEGRAM') return await sendTelegram(d, patient, docs);
    if (d.channel === 'WHATSAPP') return await sendWhatsApp(d, patient, docs);
    return await sendMax(d, patient, docs);
  } catch (e) {
    setStatus(d, 'FAILED', { errorMessage: (e as Error).message });
  }
}

export function startPollers() {
  if (config.telegram.token) void telegramPoller();
  if (config.max.token) void maxPoller();
}
