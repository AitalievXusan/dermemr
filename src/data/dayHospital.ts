// Дневной стационар: курс лечения на 10 рабочих дней (без воскресений), лист назначений с отметками.
// Шаблоны составлены по листам назначений клиники; отметка std — позиция есть в стандарте МЗ РУз.

export type DayLang = 'ru' | 'uz';
export type DaySection = 'drug' | 'top' | 'phys';
export type DayPattern = 'daily' | 'odd' | 'even' | 'home' | 'manual';
export type DayTemplate = 'vit' | 'acne' | 'empty';
export const COURSE_DAYS = 10;

export interface DayRow {
  id: string;
  sec: DaySection;
  ru: string;
  uz: string;
  /** '+' — процедура в этот день, '-' — пропуск (через день), число — доза, '' — дома по схеме. */
  cells: string[];
  std: boolean | null;
  pk: DayPattern;
}

export interface DayCourse {
  id: string;
  encounterId: string | null;
  patientId: string | null;
  fio: string;
  birthYear: string;
  phone: string;
  diagnosis: string;
  doctor: string;
  startDate: string; // YYYY-MM-DD
  template: DayTemplate;
  lang: DayLang;
  rows: DayRow[];
  status: 'ACTIVE' | 'DONE';
  createdAt: string;
  updatedAt: string;
}

export type DayCourseInput = Partial<Omit<DayCourse, 'id' | 'createdAt' | 'updatedAt'>>;

// ---------- даты курса ----------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => iso(new Date());

/** 10 рабочих дней начиная с даты старта; воскресенья пропускаются. */
export function courseDates(start: string): Date[] {
  const [y, m, d] = start.split('-').map(Number);
  const cur = y && m && d ? new Date(y, m - 1, d) : new Date();
  const out: Date[] = [];
  while (out.length < COURSE_DAYS) {
    if (cur.getDay() !== 0) out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
export const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
export const ddmmyyyy = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
};

/** Номер текущего дня курса (1…10), 0 — ещё не начался, 11 — завершён. */
export function courseDay(start: string, now = new Date()): number {
  const dates = courseDates(start);
  const today = iso(now);
  if (today < iso(dates[0])) return 0;
  if (today > iso(dates[COURSE_DAYS - 1])) return COURSE_DAYS + 1;
  const idx = dates.findIndex((d) => iso(d) >= today);
  return idx + 1;
}

// ---------- схемы ----------
export const PATTERNS: Record<Exclude<DayPattern, 'manual'>, () => string[]> = {
  daily: () => Array(COURSE_DAYS).fill('+'),
  odd: () => Array.from({ length: COURSE_DAYS }, (_, i) => (i % 2 === 0 ? '+' : '-')),
  even: () => Array.from({ length: COURSE_DAYS }, (_, i) => (i % 2 === 0 ? '-' : '+')),
  home: () => Array(COURSE_DAYS).fill(''),
};
export const nextMark = (v: string) => (v === '' ? '+' : v === '+' ? '-' : v === '-' ? '' : '+');
const days = (list: number[]) => Array.from({ length: COURSE_DAYS }, (_, i) => (list.includes(i + 1) ? '+' : ''));
const dose = (first: string[]) => [...first, ...Array(COURSE_DAYS - first.length).fill('+')];

/** Изотретиноин: обязательная сноска о беременности и печёночных пробах. */
export const isIsotretinoin = (name: string) => /изона|изотретино|роаккутан|акнекутан|isotretino/i.test(name || '');
export const WARN: Record<DayLang, string> = {
  ru: 'При беременности и её планировании ЗАПРЕЩЕНО! Обязательно печёночные пробы — АЛТ, АСТ.',
  uz: 'Ҳомиладорликда ва уни режалаштиришда ТАҚИҚЛАНАДИ! Жигар синамалари — АЛТ, АСТ мажбурий.',
};

type Seed = [DaySection, string, string, string[], boolean | null, DayPattern];
const VIT: Seed[] = [
  ['drug', 'Витамин B-комплекс 2,0 в/м 1 раз в день, №10', 'Витамин B комплекс 2.0 м/о кунига 1 маҳал. М/о №10', dose(['0,5', '1,0', '1,0']), true, 'manual'],
  ['drug', 'Натрия хлорид 0,9% — 200,0 + Юнисенто 2,0, в/в капельно, через день, №5', 'Натрий хлорид 0,9% — 200.0 + Юнисенто 2.0, в/и томчилаб, кун ора, №5', PATTERNS.even(), false, 'even'],
  ['drug', 'Натрия хлорид 0,9% — 100 мл + Стронгер нео 20,0, в/в капельно, через день, №5', 'Натрий хлорид 0,9% — 100 мл + Стронгер нео 20.0, в/и томчилаб, кун ора, №5', PATTERNS.odd(), false, 'odd'],
  ['drug', 'Альфа-липоевая кислота 300 мг, по 1 таб. 2 раза в день', 'Альфа-липоев кислотаси 300, 1 тадан кунига 2 маҳал', PATTERNS.daily(), true, 'daily'],
  ['drug', 'Витамин D 5000 МЕ, 1 таб. в 8:00, №10. Рекомендовано: 1 месяц', 'Витамин D 5000 ХБ 1 таб. соат 8:00 да, №10. Тавсия: 1 ой', PATTERNS.home(), true, 'home'],
  ['drug', 'Гинкго билоба, по 1 таб. 2 раза в день', 'Гинкго билоба, 1 тадан кунига 2 маҳал', PATTERNS.home(), false, 'home'],
  ['top', 'Комфодерм мазь 0,1%, наносить 1 раз в день', 'Комфодерм малҳами 0.1%, кунига 1 маҳал суртиш', PATTERNS.home(), false, 'home'],
  ['top', 'EPTA VTLG 1 раз в день, за 15 мин до УФО', 'EPTA VTLG кунига 1 маҳал, УФО дан 15 дақиқа олдин', PATTERNS.daily(), true, 'daily'],
  ['phys', 'PRP-терапия', 'PRP-терапия', days([1, 5, 10]), true, 'manual'],
  ['phys', 'UVB 311 нм, №10', 'UVB 311 нм, №10', days([1, 4, 6, 8, 10]), true, 'manual'],
  ['phys', 'Эксимерный лазер 308 нм', 'Эксимер лазер 308 нм', days([2, 4, 6, 8, 10]), true, 'manual'],
  ['phys', 'CO2-лазер', 'CO2 лазер', days([1, 10]), false, 'manual'],
];
const ACNE: Seed[] = [
  ['drug', 'Витамин B-комплекс 2,0 в/м 1 раз в день, №10', 'Витамин B комплекс 2.0 м/о кунига 1 маҳал. М/о №10', dose(['0,5', '1,0', '1,0']), null, 'manual'],
  ['drug', 'Натрия хлорид 0,9% — 200,0 + Юнисенто 2,0, в/в капельно, через день, №5', 'Натрий хлорид 0,9% — 200.0 + Юнисенто 2.0, в/и томчилаб кунига 1 маҳал, кун ора, №5', PATTERNS.even(), null, 'even'],
  ['drug', 'Натрия хлорид 0,9% — 100 мл + Стронгер нео 20,0, в/в капельно, через день, №5', 'Натрий хлорид 0,9% — 100 мл + Стронгер нео 20.0, в/и томчилаб, кун ора, №5', PATTERNS.odd(), null, 'odd'],
  ['drug', 'Витамин D 5000 МЕ, 1 таб. в 8:00, №10. Рекомендовано: 1 месяц', 'Витамин D 5000 ХБ 1 таб. кунига 1 маҳал соат 8:00 да, №10. Тавсия: 1 ой', PATTERNS.home(), null, 'home'],
  ['drug', 'Азитромицин 500 мг, по 1 таб. 1 раз в день, 6 дней', 'Азитромицин таб. 500, 1 тадан кунига 1 маҳал, 6 кун', PATTERNS.home(), null, 'home'],
  ['drug', 'Изона капс. 20 мг, по 1 капс. 1 раз в день, 10 дней', 'Изона капс. 20, 1 тадан кунига 1 маҳал, 10 кун', PATTERNS.home(), null, 'home'],
  ['top', 'Клензит гель 15 г', 'Клензит гел 15 г', PATTERNS.daily(), null, 'daily'],
  ['phys', 'Мезотерапия Тренакса', 'Тренакса билан мезотерапия', days([1, 5, 10]), null, 'manual'],
  ['phys', 'Фототерапия, №10', 'Фототерапия №10', PATTERNS.daily(), null, 'daily'],
  ['phys', 'VBEAM лазер', 'VBEAM лазер', days([1]), null, 'manual'],
  ['phys', 'Криотерапия', 'Криотерапия', PATTERNS.daily(), null, 'daily'],
];

let seq = 0;
export const rowId = () => `dr_${Date.now().toString(36)}_${(seq++).toString(36)}`;
export const emptyRow = (sec: DaySection): DayRow => ({ id: rowId(), sec, ru: '', uz: '', cells: Array(COURSE_DAYS).fill(''), std: null, pk: 'manual' });

export function templateRows(t: DayTemplate): DayRow[] {
  const src = t === 'vit' ? VIT : t === 'acne' ? ACNE : [];
  return src.map(([sec, ru, uz, cells, std, pk]) => ({ id: rowId(), sec, ru, uz, cells: [...cells], std, pk }));
}

/** Шаблон по коду МКБ-10 из амбулаторного приёма. */
export const templateForIcd = (icd: string): DayTemplate => (/^L80/i.test(icd) ? 'vit' : /^L70/i.test(icd) ? 'acne' : 'empty');

export const TEMPLATE_STD_TOTAL = VIT.length;
export const TEMPLATE_STD_IN = VIT.filter((r) => r[4] === true).length;

// ---------- интерфейс на русском и узбекском (кириллица) ----------
export const DH_TR = {
  ru: {
    section: 'Дневной стационар', title: 'Курс лечения · 10 дней', print: 'Печать листа', patient: 'Пациент',
    linked: 'Данные перенесены из амбулаторного приёма. Изменения можно внести здесь.', openVisit: 'Открыть приём',
    fio: 'Ф. И. О.', year: 'Год рождения', phone: 'Телефон', dx: 'Диагноз', doctor: 'Врач', start: 'Начало курса',
    template: 'Шаблон курса', vit: 'Витилиго · L80', acne: 'Акне · L70.0', empty: 'Пустой', course: '10 дней · без воскресений',
    replaceTpl: 'Заменить назначения шаблоном? Текущие строки будут удалены.',
    noProto: 'Протокола МЗ РУз по акне нет в базе — используется шаблон клиники.',
    std: 'Шаблон клиники сверен со стандартом МЗ РУз по витилиго: в стандарте {n} из {m} позиций',
    colName: 'Назначение', colPat: 'Схема', addRow: 'Добавить строку', namePh: 'Препарат или процедура…', inStd: 'в стандарте МЗ РУз',
    pDaily: 'Ежедневно', pOdd: 'Через день (с 1-го)', pEven: 'Через день (со 2-го)', pHome: 'Дома по схеме', pManual: 'Вручную',
    remove: 'Удалить строку', drug: 'Препараты', top: 'Наружно', phys: 'Физиотерапия',
    legend: '«+» — процедура в этот день · «−» — пропуск (через день) · число — доза · пусто — дома по схеме · нажмите на клетку, чтобы изменить',
    saved: 'Сохранено', saving: 'Сохранение…', deleteCourse: 'Удалить курс', confirmDelete: 'Удалить этот курс дневного стационара?',
    done: 'Курс завершён', reopen: 'Вернуть в работу', finish: 'Завершить курс',
  },
  uz: {
    section: 'Кундузги стационар', title: 'Даволаш курси · 10 кун', print: 'Варақани чоп этиш', patient: 'Бемор',
    linked: 'Маълумотлар амбулатор қабулдан ўтказилди. Ўзгартиришни шу ерда киритиш мумкин.', openVisit: 'Қабулни очиш',
    fio: 'Ф. И. Ш.', year: 'Туғилган йили', phone: 'Телефон', dx: 'Ташхис', doctor: 'Шифокор', start: 'Курс бошланиши',
    template: 'Курс андозаси', vit: 'Витилиго · L80', acne: 'Акне · L70.0', empty: 'Бўш', course: '10 кун · якшанбасиз',
    replaceTpl: 'Тайинловлар андоза билан алмаштирилсинми? Жорий қаторлар ўчирилади.',
    noProto: 'ЎзР ССВ акне бўйича протоколи базада йўқ — клиника андозаси ишлатилмоқда.',
    std: 'Клиника андозаси ЎзР ССВ витилиго стандарти билан солиштирилди: {m} тадан {n} таси стандартда',
    colName: 'Тайинланган муолажа', colPat: 'Схема', addRow: 'Қатор қўшиш', namePh: 'Дори ёки муолажа…', inStd: 'ЎзР ССВ стандартида',
    pDaily: 'Ҳар куни', pOdd: 'Кун ора (1-кундан)', pEven: 'Кун ора (2-кундан)', pHome: 'Уйда схема бўйича', pManual: 'Қўлда',
    remove: 'Қаторни ўчириш', drug: 'Дори воситалари', top: 'Ташқи', phys: 'Физиотерапия',
    legend: '«+» — шу куни муолажа · «−» — ўтказиб юборилади (кун ора) · сон — доза · бўш — уйда схема бўйича · ўзгартириш учун катакни босинг',
    saved: 'Сақланди', saving: 'Сақланмоқда…', deleteCourse: 'Курсни ўчириш', confirmDelete: 'Ушбу кундузги стационар курси ўчирилсинми?',
    done: 'Курс якунланди', reopen: 'Қайта очиш', finish: 'Курсни якунлаш',
  },
} as const;

/** Лист назначений для печати. */
export const PRINT_TR = {
  ru: {
    title: 'Лист назначений', doc: 'Врач', dx: 'Диагноз', pt: 'Пациент', yr: 'Год рождения', ph: 'Телефон', num: '№', name: 'Назначение',
    phys: 'Физиотерапия:', sign1: 'Врач', sign2: 'Медсестра',
    legend: 'в/м — внутримышечно; в/в — внутривенно; МЕ — международные единицы. «+» — процедура, «−» — пропуск (через день).',
    clinic: 'Dermaclinic — центр дерматологии и эстетики · г. Ташкент, ул. Буюк Ипак Юли, 187',
  },
  uz: {
    title: 'Муолажалар варақаси', doc: 'Шифокор', dx: 'Ташхис', pt: 'Бемор', yr: 'Туғилган йили', ph: 'Телефон', num: '№', name: 'Тайинланган муолажа',
    phys: 'Физиотерапия:', sign1: 'Шифокор', sign2: 'Ҳамшира',
    legend: 'м/о — мушак орасига; в/и — вена ичига; ХБ — халқаро бирлик. «+» — муолажа, «−» — ўтказиб юборилади (кун ора).',
    clinic: 'Dermaclinic — дерматология ва эстетика маркази · Тошкент ш., Буюк Ипак Йўли кўчаси, 187',
  },
} as const;
