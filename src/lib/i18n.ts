import { createStore, useStore } from './store';
import { UZ } from '../i18n/uz';

// Язык интерфейса: русский или узбекский (кириллица). Ключ перевода — русская строка:
// t('Очередь') → «Навбат». Нет перевода — показывается русский текст.
// Клинические записи врача, МКБ-10, названия препаратов и тексты протоколов МЗ РУз не переводятся.
export type Lang = 'ru' | 'uz';

const KEY = 'dermemr-lang';
const stored = (): Lang => {
  try {
    return localStorage.getItem(KEY) === 'uz' ? 'uz' : 'ru';
  } catch {
    return 'ru';
  }
};

export const langStore = createStore<{ lang: Lang }>({ lang: typeof window === 'undefined' ? 'ru' : stored() });

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'uz' ? 'uz-Cyrl' : 'ru';
  langStore.set((s) => { s.lang = lang; });
}

export const getLang = () => langStore.get().lang;

/** Перевод строки для текущего языка; {name} в строке заменяется значением из params. */
export function tr(text: string, params?: Record<string, string | number>): string {
  const out = getLang() === 'uz' ? UZ[text] ?? text : text;
  return params ? out.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`)) : out;
}

/** Хук: перерисовывает компонент при смене языка и возвращает функцию перевода. */
export function useT() {
  useStore(langStore, (s) => s.lang);
  return tr;
}

export const useLang = () => useStore(langStore, (s) => s.lang);

/** Подпись с учётом языка: для объектов {name, nameUz} из справочников. */
export const pick = (ru: string, uz?: string) => (getLang() === 'uz' && uz ? uz : ru);

const MONTHS_UZ = ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
/** «23 ноября» / «23 ноябр». */
export const dayMonth = (d: Date) =>
  getLang() === 'uz' ? `${d.getDate()} ${MONTHS_UZ[d.getMonth()]}` : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/** Склонение для русского; в узбекском после числа существительное не меняется. */
export const plural = (n: number, one: string, few: string, many: string, uz?: string) => {
  if (getLang() === 'uz') return uz ?? tr(many);
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/** Сумма в сумах: «200 000 сум» / «200 000 сўм». */
export const money = (v: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v))} ${getLang() === 'uz' ? 'сўм' : 'сум'}`;

/** Возраст с сервера «34 г. 4 мес.» → «34 ёш 4 ой». */
export const ageText = (s: string) => (getLang() === 'uz' ? s.replace(/\s(г\.|л\.)/, ' ёш').replace(/\sмес\./, ' ой') : s);
