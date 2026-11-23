// Клинические протоколы и стандарты МЗ РУз: загрузка справочника и вспомогательные функции.
// Справочник src/data/guidelines.json собран из PDF в папке guidelines/ (таблицы «Лечебные мероприятия»
// и «Диагностические мероприятия» стандартов). Грузится лениво — отдельным чанком при первом обращении.
import { useEffect, useState } from 'react';

export type GuidelineGroup = 'topical' | 'systemic' | 'procedure';

export interface GuidelineDrug {
  /** Группа: наружная терапия, системная терапия, процедуры/физиотерапия. */
  g: GuidelineGroup;
  /** Раздел стандарта: m — основные, a — дополнительные лечебные мероприятия. */
  s: 'm' | 'a';
  /** Название (МНН) как в стандарте. */
  n: string;
  /** Дозировка и способ применения. */
  d: string;
  /** Средняя суточная доза. */
  dd: string;
  /** Курсовая доза. */
  cd: string;
  /** В стандарте не отмечено для первичного звена (СВП/ЦМП), только для районного уровня и выше. */
  sp: boolean;
  /** Страница стандарта (PDF). */
  p: number;
  /** Текст дозировки в PDF не распознан — смотреть первоисточник. */
  bad?: 1;
}

export interface GuidelineDiag {
  c: string;
  n: string;
  sp: boolean;
}

export interface GuidelineDoc {
  file: string;
  page: number;
}

export interface Guideline {
  id: string;
  title: string;
  icd: { code: string; name: string }[];
  kp: GuidelineDoc | null;
  std: GuidelineDoc;
  extra: { file: string; title: string }[];
  diag: GuidelineDiag[];
  drugs: GuidelineDrug[];
  note?: string;
}

let cache: Guideline[] | null = null;
let pending: Promise<Guideline[]> | null = null;

export function loadGuidelines(): Promise<Guideline[]> {
  pending ??= import('../data/guidelines.json').then((m) => {
    cache = m.default as unknown as Guideline[];
    return cache;
  });
  return pending;
}

export const getGuidelinesSync = () => cache;

/** React-хук: справочник протоколов (null, пока грузится). */
export function useGuidelines(): Guideline[] | null {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (!data) void loadGuidelines().then(setData);
  }, [data]);
  return data;
}

/** Протоколы для кода МКБ-10: сначала точное совпадение, затем по рубрике (L40.0 → L40). */
export function matchGuidelines(list: Guideline[], code: string): Guideline[] {
  const c = code.trim().toUpperCase();
  if (!c) return [];
  const exact = list.filter((g) => g.icd.some((i) => i.code === c));
  if (exact.length) return exact;
  const head = c.split('.')[0];
  return list.filter((g) => g.icd.some((i) => i.code.split('.')[0] === head));
}

/** Ссылка на PDF первоисточника, открывается на нужной странице. */
export const pdfUrl = (file: string, page?: number) => `/guidelines/${encodeURIComponent(file)}${page ? `#page=${page}` : ''}`;

/** Основа названия препарата для сравнения: «Мометазона фуроат: 0,1%» → «мометазон». */
export function drugKey(name: string): string {
  const head = name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[\d:(,;%+]/)[0]
    .replace(/(^|\s)(наружно|наружный|пероральный|перорально|топические|раствор|таблетки|мазь|крем|гель|рекомбинантные|комплекс)(?=\s|$)/g, ' ')
    .trim();
  const word = head.split(/\s+/).find((w) => w.length >= 4) ?? head;
  return word.slice(0, Math.max(5, Math.min(word.length - 1, 7)));
}

/** Есть ли препарат в стандарте нозологии (сравнение по основе МНН). */
export function drugInGuideline(g: Guideline, drugName: string): boolean {
  const k = drugKey(drugName);
  if (k.length < 4) return true;
  return g.drugs.some((d) => d.g !== 'procedure' && d.n.toLowerCase().replace(/ё/g, 'е').includes(k));
}

/** Кратность из текста стандарта: «наружно 1–2 раза в сутки…» → «1–2 раза в сутки». */
export function parseFrequency(text: string): string {
  const m = text.match(/(\d+(?:\s*[–-]\s*\d+)?)\s*раз[а]?\s*(?:в\s*|\/\s*)(сутки|сут\.?|день|неделю|нед\.?)/i);
  if (!m) return '';
  const unit = /^нед/i.test(m[2]) ? 'неделю' : /^сут/i.test(m[2]) ? 'сутки' : m[2].toLowerCase();
  const n = m[1].replace(/\s*[-–]\s*/, '–');
  const last = Number(n.split('–').pop());
  const word = last % 10 >= 2 && last % 10 <= 4 && (last % 100 < 12 || last % 100 > 14) ? 'раза' : 'раз';
  return `${n} ${word} в ${unit}`;
}

/** Длительность курса в днях: «в течение 2–4 – х недель» → 28; «7-14 дней» → 14; «6 месяцев» → 180. */
export function parseDurationDays(text: string): number | null {
  const m = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*[–-]?\s*(?:х\s*)?(недел|нед|дн|сут|мес)/i);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  if (!n) return null;
  const u = m[3].toLowerCase();
  const days = u.startsWith('нед') ? n * 7 : u.startsWith('мес') ? n * 30 : n;
  return days > 0 && days <= 730 ? days : null;
}

const FORMS: [RegExp, string][] = [
  [/мазь|мази/i, 'Мазь'],
  [/гель/i, 'Гель'],
  [/лосьон/i, 'Лосьон'],
  [/эмульс/i, 'Эмульсия'],
  [/шампун/i, 'Шампунь'],
  [/(^|[\s,(])лак([\s,).]|$)/i, 'Лак'],
  [/спрей|аэрозол/i, 'Спрей'],
  [/раствор|примочк/i, 'Раствор'],
  [/крем/i, 'Крем'],
];

/** Лекарственная форма для наружного назначения по названию/описанию из стандарта. */
export function guessTopicalForm(name: string, dose: string): string {
  for (const [re, form] of FORMS) if (re.test(name)) return form;
  for (const [re, form] of FORMS) if (re.test(dose.slice(0, 80))) return form;
  return 'Крем';
}
