import type { BillingCategory } from '../types';

// Прейскурант клиники (мок). Коды — номенклатура медицинских услуг.
export interface PriceEntry {
  code: string;
  name: string;
  price: number;
  defaultCategory: BillingCategory;
}

export const PRICE_LIST: PriceEntry[] = [
  { code: 'B01.008.001', name: 'Прием врача-дерматовенеролога первичный', price: 3500, defaultCategory: 'RENDERED' },
  { code: 'B01.008.002', name: 'Прием врача-дерматовенеролога повторный', price: 2800, defaultCategory: 'RENDERED' },
  { code: 'A03.01.001', name: 'Дерматоскопия образований кожи (1 элемент)', price: 900, defaultCategory: 'RENDERED' },
  { code: 'A03.01.002', name: 'Трихоскопия', price: 2200, defaultCategory: 'RENDERED' },
  { code: 'A16.01.017', name: 'Криодеструкция новообразования кожи (1 элемент)', price: 1200, defaultCategory: 'RENDERED' },
  { code: 'A16.01.023', name: 'Радиоволновое удаление новообразования (1 элемент)', price: 3900, defaultCategory: 'RENDERED' },
  { code: 'A11.01.009', name: 'Соскоб кожи / ногтей на патогенные грибы', price: 650, defaultCategory: 'RENDERED' },
  { code: 'A11.01.016', name: 'Получение соскоба на Demodex', price: 600, defaultCategory: 'RENDERED' },
  { code: 'A08.01.001', name: 'Гистологическое исследование биоптата кожи', price: 4200, defaultCategory: 'PRESCRIBED' },
  { code: 'B03.016.004', name: 'Биохимический анализ крови (АЛТ, АСТ, билирубин, липидограмма)', price: 2600, defaultCategory: 'PRESCRIBED' },
  { code: 'B03.016.003', name: 'Общий анализ крови с лейкоформулой', price: 750, defaultCategory: 'PRESCRIBED' },
  { code: 'A09.05.090', name: 'ХГЧ в крови (тест на беременность)', price: 690, defaultCategory: 'PRESCRIBED' },
  { code: 'A09.05.076', name: 'Ферритин', price: 820, defaultCategory: 'PRESCRIBED' },
  { code: 'A09.05.065', name: 'ТТГ', price: 640, defaultCategory: 'PRESCRIBED' },
  { code: 'A09.05.205', name: 'Витамин D (25-OH)', price: 2100, defaultCategory: 'PRESCRIBED' },
  { code: 'A26.01.001', name: 'Бактериологический посев с чувствительностью к антибиотикам', price: 1450, defaultCategory: 'PRESCRIBED' },
  { code: 'B01.008.002-14', name: 'Контрольный прием дерматовенеролога (через 14 дней)', price: 2800, defaultCategory: 'PRESCRIBED' },
];

export function searchPrice(query: string, limit = 8): PriceEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PRICE_LIST.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, limit);
}

export const findPrice = (code: string) => PRICE_LIST.find((p) => p.code === code);
