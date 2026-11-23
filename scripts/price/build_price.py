"""Генератор src/data/priceList.ts из прайса клиники (xlsx, RU/UZ).
Запуск: pip install openpyxl; python scripts/price/build_price.py путь/к/Price_RU_UZ.xlsx
После обновления увеличьте PRICE_LIST_VERSION, чтобы сервер заменил прайс в storage/db.json."""
import openpyxl, json, re
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / 'Price_RU_UZ.xlsx')
wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb.active
rows = [r for r in ws.iter_rows(min_row=3, values_only=True) if any(c is not None for c in r)]
GROUPS = {  # заголовок раздела → (группа RU, группа UZ, категория по умолчанию)
  'Консультации специалистов': ('Консультации', 'Консультациялар', 'RENDERED'),
  'КОСМЕТОЛОГИЯ': ('Косметология', 'Косметология', 'RENDERED'),
  'Лазерная эпиляция': ('Лазерная эпиляция', 'Лазерли эпиляция', 'RENDERED'),
  'МЕЗОТЕРАПИЯ': ('Мезотерапия', 'Мезотерапия', 'RENDERED'),
  'БИОРЕВИТАЛИЗАЦИЯ': ('Биоревитализация', 'Биоревитализация', 'RENDERED'),
  'PDLLA (ПОЛИМОЛОЧНАЯ КИСЛОТА)': ('PDLLA', 'PDLLA', 'RENDERED'),
  'КОНТУРНАЯ ПЛАСТИКА ГУБ': ('Контурная пластика губ', 'Лаб контур пластикаси', 'RENDERED'),
  'ЭКЗОСОМЫ': ('Экзосомы', 'Экзосомалар', 'RENDERED'),
  'БОТУЛИНОТЕРАПИЯ (БОТОКС)': ('Ботулинотерапия', 'Ботулинотерапия', 'RENDERED'),
  'ЛАБОРАТОРНЫЕ АНАЛИЗЫ': ('Лабораторные анализы', 'Лаборатория таҳлиллари', 'PRESCRIBED'),
}
# Позиции прайса, к которым привязаны прежние коды программы (шаблоны, автосчёт дерматоскопии, демо-визиты).
LEGACY = {
  'Консультация дерматовенеролога': 'B01.008.001',
  'Повторная консультация (в течение месяца)': 'B01.008.002',
  'Криодеструкция (за 1 элемент)': 'A16.01.017',
  'Общий анализ крови, 29 параметров + СОЭ': 'B03.016.003',
  'Ферритин': 'A09.05.076',
  'ТТГ (3-го поколения)': 'A09.05.065',
  'Витамин D (25-OH)': 'A09.05.205',
}
out, seen, group, n = [], set(), None, 0
for _, _id, ru, uzl, uzc, price in rows:
    if ru in GROUPS and price is None:
        group = GROUPS[ru]; continue
    if ru is None or ru == 'Русский' or (_id == 'ID'): continue
    ru, uzc = ru.strip(), (uzc or uzl or ru).strip()
    gname = group[0] if group else ''
    name, name_uz = ru, uzc
    if gname == 'Лазерная эпиляция' and not ru.lower().startswith('лазерная эпиляция'):
        name, name_uz = f'Лазерная эпиляция: {ru.lower() if ru[1:2].islower() else ru}', f'Лазерли эпиляция: {uzc.lower() if uzc[1:2].islower() else uzc}'
    if name in seen: continue  # повторы в файле (DHEA-S, прогестерон, тестостерон, пролактин, железо)
    seen.add(name)
    n += 1
    e = {'code': LEGACY.get(ru, f'DC-{n:03d}'), 'name': name, 'nameUz': name_uz, 'group': gname, 'groupUz': group[1] if group else '',
         'price': 0, 'defaultCategory': group[2] if group else 'RENDERED'}
    if isinstance(price, (int, float)):
        e['price'] = int(price)
    elif isinstance(price, str):
        p = price.replace(' ', '')
        m = re.fullmatch(r'(\d+)-(\d+)', p)
        if m:
            e['price'] = int(m.group(1)); e['priceMax'] = int(m.group(2)); e['note'] = f'{int(m.group(1)):,}–{int(m.group(2)):,} сум'.replace(',', ' ')
        elif '$' in p:
            e['note'] = p.replace('-', '–')  # цена в долларах: сумму в сумах врач/кассир вписывает сам
        else:
            e['note'] = price
    else:
        e['note'] = 'цена не указана'
    out.append(e)
# Услуги программы, которых нет в прайсе клиники: остаются, цену вписывают вручную.
EXTRA = [
  ('A03.01.001', 'Дерматоскопия образований кожи (1 элемент)', 'Тери ҳосилалари дерматоскопияси (1 элемент)', 'Диагностика', 'Диагностика', 'RENDERED'),
  ('A03.01.002', 'Трихоскопия', 'Трихоскопия', 'Диагностика', 'Диагностика', 'RENDERED'),
  ('A16.01.023', 'Радиоволновое удаление новообразования (1 элемент)', 'Янги ҳосилани радиотўлқин билан олиб ташлаш (1 элемент)', 'Манипуляции', 'Муолажалар', 'RENDERED'),
  ('A11.01.009', 'Соскоб кожи / ногтей на патогенные грибы', 'Тери / тирноқдан патоген замбуруғларга қириндиси', 'Диагностика', 'Диагностика', 'RENDERED'),
  ('A11.01.016', 'Получение соскоба на Demodex', 'Demodex га қиринди олиш', 'Диагностика', 'Диагностика', 'RENDERED'),
  ('A08.01.001', 'Гистологическое исследование биоптата кожи', 'Тери биоптатини гистологик текшириш', 'Лабораторные анализы', 'Лаборатория таҳлиллари', 'PRESCRIBED'),
  ('B03.016.004', 'Биохимический анализ крови (АЛТ, АСТ, билирубин, липидограмма)', 'Қоннинг биокимёвий таҳлили (АЛТ, АСТ, билирубин, липидограмма)', 'Лабораторные анализы', 'Лаборатория таҳлиллари', 'PRESCRIBED'),
  ('A09.05.090', 'ХГЧ в крови (тест на беременность)', 'Қонда ХГЧ (ҳомиладорлик тести)', 'Лабораторные анализы', 'Лаборатория таҳлиллари', 'PRESCRIBED'),
  ('A26.01.001', 'Бактериологический посев с чувствительностью к антибиотикам', 'Антибиотикларга сезгирлик билан бактериологик экма', 'Лабораторные анализы', 'Лаборатория таҳлиллари', 'PRESCRIBED'),
]
for code, ru, uz, g, gu, cat in EXTRA:
    out.append({'code': code, 'name': ru, 'nameUz': uz, 'group': g, 'groupUz': gu, 'price': 0, 'defaultCategory': cat, 'note': 'нет в прайсе — впишите цену', 'custom': True})
# Контрольный приём — по цене повторной консультации
rep = next(x for x in out if x['code'] == 'B01.008.002')
out.append({'code': 'B01.008.002-14', 'name': 'Контрольный приём дерматовенеролога (через 14 дней)', 'nameUz': 'Дерматовенеролог назорат қабули (14 кундан кейин)', 'group': 'Консультации', 'groupUz': 'Консультациялар', 'price': rep['price'], 'defaultCategory': 'PRESCRIBED'})
print(len(out), sum(1 for x in out if x['price'] == 0), 'без цены')
ts = '''import type { BillingCategory } from '../types';

// Прейскурант Dermaclinic (сум). Источник — файл клиники «Price_RU_UZ.xlsx»: названия на русском и узбекском (кириллица).
// price — цена в сумах; для диапазона «от–до» это нижняя граница (priceMax — верхняя), фактическую сумму врач вписывает в счёт.
// price = 0 — цена не указана (в долларах, нет в прайсе или не задана): сумму вписывают вручную.
export interface PriceEntry {
  code: string;
  name: string;
  nameUz?: string;
  group?: string;
  groupUz?: string;
  price: number;
  priceMax?: number;
  /** Пометка к цене: диапазон, цена в долларах, «нет в прайсе». */
  note?: string;
  /** Услуга программы, которой нет в прайсе клиники. */
  custom?: boolean;
  defaultCategory: BillingCategory;
}

/** Версия прайса: сервер заменяет сохранённый справочник, если версия устарела. */
export const PRICE_LIST_VERSION = '2026-11-uzs-1';

export const PRICE_LIST: PriceEntry[] = [
''' + ''.join('  ' + json.dumps(e, ensure_ascii=False).replace('"code"', 'code').replace('"name"', 'name').replace('"nameUz"', 'nameUz').replace('"groupUz"', 'groupUz').replace('"group"', 'group').replace('"priceMax"', 'priceMax').replace('"price"', 'price').replace('"defaultCategory"', 'defaultCategory').replace('"note"', 'note').replace('"custom"', 'custom') + ',\n' for e in out) + '''];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Поиск по прайсу: русское и узбекское название, раздел, код. */
export function searchPrice(query: string, limit = 8): PriceEntry[] {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\\s+/);
  const hay = (p: PriceEntry) => norm(`${p.name} ${p.nameUz ?? ''} ${p.group ?? ''} ${p.code}`);
  return PRICE_LIST.filter((p) => words.every((w) => hay(p).includes(w))).slice(0, limit);
}

export const findPrice = (code: string) => PRICE_LIST.find((p) => p.code === code);
'''
open(ROOT / 'src' / 'data' / 'priceList.ts', 'w', encoding='utf-8').write(ts)
print('priceList.ts:', SRC)
