// Конструктор курса витилиго для дневного стационара.
// Правила взяты из 149 листов назначений врача клиники (Мирзаахмедов Э. Ш.) и сверены с протоколом МЗ РУз:
// каркас курса одинаков, меняются дозы по возрасту, препараты по номеру курса, стадии и галоневусу Сеттона.
// Детям (до 18 лет) по протоколу МЗ: Такропик 0,03%, EPTA VTLG не назначается (врач может вернуть).

import {
  COURSE_DAYS, PATTERNS, courseDates, days, rowId,
  type AfterRow, type DayCourse, type DayLang, type DayPattern, type DayRow, type DaySection, type VitParams,
} from './dayHospital';

export const DEFAULT_VIT: VitParams = { stage: 'prog', course: 1, setton: false, eptaBack: false };

export type AgeGroup = 'u7' | 'c' | 't' | 'a';

/** Полных лет на начало курса по году рождения (без даты рождения — с точностью до года). */
export function ageOf(birthYear: string, startDate: string): number | null {
  const y = Number(String(birthYear || '').trim().slice(0, 4));
  const now = Number(String(startDate || '').slice(0, 4)) || new Date().getFullYear();
  if (!y || y < 1900 || y > now) return null;
  return now - y;
}

/** до 7 лет · 7–11 · 12–17 · взрослые. Год рождения не указан — взрослые дозы. */
export const ageGroup = (age: number | null): AgeGroup => (age === null ? 'a' : age < 7 ? 'u7' : age < 12 ? 'c' : age < 18 ? 't' : 'a');
export const isChild = (age: number | null) => age !== null && age < 18;

const fmt = (n: number) => String(n).replace('.', ',');

/** Таблетки дексаметазона 0,5 мг на приём (пн и чт) по возрасту и номеру курса: −½ таб. с каждым курсом. */
export function dexTabs(age: number | null, course: number): number {
  const a = age ?? 30;
  if (a < 7) return course >= 4 ? 0.5 : 1;
  const base = a < 12 ? 2 : a < 17 ? 3 : a < 30 ? 3 : 4;
  return Math.max(1, base - 0.5 * (Math.min(course, 4) - 1));
}

/** Дексаметазон в дни курса: доза в понедельник и четверг. */
export function dexCells(startDate: string, tabs: number): string[] {
  return courseDates(startDate).map((d) => (d.getDay() === 1 || d.getDay() === 4 ? fmt(tabs) : ''));
}

/** Доза дексаметазона из строки листа (для следующего курса). */
export function dexFromRows(rows: DayRow[]): number | null {
  const r = rows.find((x) => x.key === 'dex') ?? rows.find((x) => /дексаметазон/i.test(x.ru) && !/4\s*мг|в\/в/i.test(x.ru));
  const m = r?.ru.match(/(\d+(?:[.,]\d+)?)\s*таб/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Прошлые курсы этого пациента по той же нозологии (по умолчанию витилиго) (по карточке или ФИО + год рождения), новые первыми. */
export function previousCourses(c: Pick<DayCourse, 'id' | 'patientId' | 'fio' | 'birthYear' | 'startDate' | 'createdAt'>, all: DayCourse[], template: DayCourse['template'] = 'vit'): DayCourse[] {
  const fio = norm(c.fio || '');
  return all
    .filter((x) => x.id !== c.id && x.template === template)
    .filter((x) => (c.patientId && x.patientId ? x.patientId === c.patientId : !!fio && norm(x.fio || '') === fio && (x.birthYear || '') === (c.birthYear || '')))
    .filter((x) => (x.startDate || '') < (c.startDate || '') || ((x.startDate || '') === (c.startDate || '') && x.createdAt < c.createdAt))
    .sort((a, b) => (b.startDate + b.createdAt).localeCompare(a.startDate + a.createdAt));
}

export interface VitHistory {
  count: number;
  last: DayCourse | null;
  lastDex: number | null;
}
export function vitHistory(c: Parameters<typeof previousCourses>[0], all: DayCourse[]): VitHistory {
  const prev = previousCourses(c, all);
  return { count: prev.length, last: prev[0] ?? null, lastDex: prev[0] ? dexFromRows(prev[0].rows) : null };
}

/** Стадия из текста диагноза. */
export const stageFromDiagnosis = (dx: string): VitParams['stage'] => (/ремисс|стаб|стацион|stab|remiss/i.test(dx || '') ? 'stat' : 'prog');

/** Начальные параметры: номер курса по истории, стадия из диагноза. */
export function initialParams(c: Pick<DayCourse, 'diagnosis'>, h: VitHistory): VitParams {
  const course = Math.min(4, h.count + 1) as VitParams['course'];
  return { ...DEFAULT_VIT, course, stage: stageFromDiagnosis(c.diagnosis), setton: /сеттон|сеттона|галоневус|setton|sutton/i.test(c.diagnosis || '') };
}

export interface Chip { ru: string; uz: string }
export interface VitBuild { rows: DayRow[]; after: AfterRow[]; chips: Chip[]; dex: number }

type Line = [DaySection, string, string, string[], boolean, DayPattern, string, string];

/** Собирает лист назначений и рекомендации после курса. */
export function buildVit(opts: { age: number | null; params: VitParams; startDate: string; prevDex?: number | null; prevStart?: string | null }): VitBuild {
  const { age, params: p, startDate } = opts;
  const g = ageGroup(age);
  const kid = g === 'u7' || g === 'c';
  const minor = isChild(age);
  const course = p.course;
  const lines: Line[] = [];
  const add = (sec: DaySection, ru: string, uz: string, cells: string[], std: boolean, pk: DayPattern, key: string, why = '') => lines.push([sec, ru, uz, cells, std, pk, key, why]);
  const ageWhy = g === 'a' ? '' : kid ? 'kid' : 'age';

  // ----- препараты -----
  const b = g === 'u7' || g === 'c' ? '1,0' : '2,0';
  add('drug', `Витамин B-комплекс ${b} в/м 1 раз в день, №10`, `Витамин B комплекс ${b} м/о кунига 1 маҳал, №10`, PATTERNS.daily(), true, 'daily', 'vitb', g === 'a' || g === 't' ? '' : 'age');
  if (!kid) {
    add('drug', 'Натрия хлорид 0,9% — 200,0 + Юнисента 2,0, в/в капельно, через день, №5', 'Натрий хлорид 0,9% — 200,0 + Юнисента 2,0, в/и томчилаб, кун ора, №5', PATTERNS.even(), false, 'even', 'unicenta');
  }
  if (g !== 'u7') {
    const s = g === 'c' || (age !== null && age < 14) ? '10,0' : '20,0';
    if (kid) add('drug', `Натрия хлорид 0,9% — 100,0 + Стронгер нео ${s}, в/в капельно, ежедневно, №10`, `Натрий хлорид 0,9% — 100,0 + Стронгер нео ${s}, в/и томчилаб, ҳар куни, №10`, PATTERNS.daily(), false, 'daily', 'stronger', 'age');
    else add('drug', `Натрия хлорид 0,9% — 100,0 + Стронгер нео ${s}, в/в капельно, через день, №5`, `Натрий хлорид 0,9% — 100,0 + Стронгер нео ${s}, в/и томчилаб, кун ора, №5`, PATTERNS.odd(), false, 'odd', 'stronger', s === '10,0' ? 'age' : '');
  }
  const prev = opts.prevDex ?? null;
  const dex = prev ? Math.max(0.5, prev - 0.5) : dexTabs(age, course);
  const dexWhy = prev ? `dex:${fmt(prev)}:${fmt(dex)}` : g === 'a' && course === 1 ? '' : 'dexage';
  add('drug', `Дексаметазон 0,5 мг — ${fmt(dex)} таб. в 9:00 по понедельникам и четвергам, 4 недели`, `Дексаметазон 0,5 мг — ${fmt(dex)} таб. соат 9:00 да душанба ва пайшанба кунлари, 4 ҳафта`, dexCells(startDate, dex), true, 'manual', 'dex', dexWhy);
  if (course <= 2) {
    const a = g === 'u7' || g === 'c' ? '1,0' : '2,0';
    add('drug', `Аскорбиновая кислота 5% ${a} в/м 1 раз в день, №10`, `Аскорбин кислотаси 5% ${a} м/о кунига 1 маҳал, №10`, PATTERNS.daily(), true, 'daily', 'ascorbic', ageWhy === 'kid' ? 'age' : '');
  } else {
    const nk = kid ? '0,5' : '1,0';
    add('drug', `Никотиновая кислота 1% ${nk} в/м 1 раз в день, №10`, `Никотин кислотаси 1% ${nk} м/о кунига 1 маҳал, №10`, PATTERNS.daily(), false, 'daily', 'nicotinic', `course:${course}`);
  }
  const asp = kid ? '½' : '1';
  add('drug', `Аспаркам ${asp} таб. 2 раза в день (8:00, 20:00), 10 дней`, `Аспаркам ${asp} таб. кунига 2 маҳал (8:00, 20:00), 10 кун`, PATTERNS.home(), false, 'home', 'asparkam', kid ? 'age' : '');
  const vd = kid ? '2000' : '5000';
  add('drug', `Витамин D ${vd} МЕ 1 раз в 8:00, №10`, `Витамин D ${vd} ХБ соат 8:00 да кунига 1 маҳал, №10`, PATTERNS.home(), true, 'home', 'vitd', kid ? 'age' : '');
  if (!kid) {
    add('drug', 'Эль-форс 1 капс. 2 раза в день, 10 дней', 'Эль-форс 1 капс. кунига 2 маҳал, 10 кун', PATTERNS.home(), false, 'home', 'elforce');
    add('drug', 'Альфа-липоевая кислота 300 мг 1 раз в 7:30 за 30 мин до еды, 10 дней', 'Альфа-липоев кислотаси 300 мг соат 7:30 да овқатдан 30 дақиқа олдин, 10 кун', PATTERNS.home(), true, 'home', 'lipoic');
  }
  if (g === 'a') add('drug', 'Гинкго билоба 60 мг 1 таб. 2 раза в день, 10 дней', 'Гинкго билоба 60 мг 1 таб. кунига 2 маҳал, 10 кун', PATTERNS.home(), false, 'home', 'ginkgo');
  if (p.setton && !kid) add('drug', 'Миномор 1 таб. 1 раз в 9:30, 10 дней', 'Миномор 1 таб. соат 9:30 да кунига 1 маҳал, 10 кун', PATTERNS.home(), false, 'home', 'minomor', 'setton');
  if (kid) {
    add('drug', 'Антрал 0,1 — 1 таб. 2 раза в день после еды, 10 дней', 'Антрал 0,1 — 1 таб. кунига 2 маҳал овқатдан кейин, 10 кун', PATTERNS.home(), true, 'home', 'antral', 'kid');
    if (g === 'u7') add('drug', 'Алфавит «Детский сад» 1 таб. 3 раза в день, 10 дней', 'Алфавит «Детский сад» 1 таб. кунига 3 маҳал, 10 кун', PATTERNS.home(), false, 'home', 'alfavit', 'kid');
    else add('drug', 'Алфавит «Школьник» 1 таб. 3 раза в день, 10 дней', 'Алфавит «Школьник» 1 таб. кунига 3 маҳал, 10 кун', PATTERNS.home(), false, 'home', 'alfavit', 'kid');
    add('drug', 'Бифолак актив 1 саше 1 раз в день, 10 дней', 'Бифолак актив 1 саше кунига 1 маҳал, 10 кун', PATTERNS.home(), false, 'home', 'bifolak', 'kid');
    const iv = g === 'u7' ? 4 : 8;
    add('drug', `Инвиреп капли по ${iv} кап. 2 раза в день (8:30, 20:30), 1 месяц`, `Инвиреп томчи ${iv} томчидан кунига 2 маҳал (8:30, 20:30), 1 ой`, PATTERNS.home(), false, 'home', 'invirep', 'kid');
  }

  // ----- наружно -----
  const tacro = course >= 2 || p.stage === 'stat';
  if (course === 1) add('top', 'Комфодерм мазь 0,1% 1 раз в день вечером, 1 месяц', 'Комфодерм малҳами 0,1% кечқурун кунига 1 маҳал, 1 ой', PATTERNS.home(), true, 'home', 'komfoderm', 'course:1');
  if (tacro) {
    const c = minor ? '0,03%' : '0,1%';
    add('top', `Такропик мазь ${c} 2 раза в день`, `Такропик малҳами ${c} кунига 2 маҳал`, PATTERNS.home(), true, 'home', 'tacro', minor ? 'mz' : course >= 2 ? `course:${course}` : 'stat');
  }
  if (!minor || p.eptaBack) add('top', 'EPTA VTLG крем 2 раза в день, за 15 мин до УФО', 'EPTA VTLG крем кунига 2 маҳал, УФО дан 15 дақиқа олдин', PATTERNS.daily(), true, 'daily', 'epta', minor ? 'back' : '');

  // ----- физиотерапия -----
  if (kid) add('phys', 'UVB 311 нм, начиная с 1 мин и прибавляя, через день, №5', 'UVB 311 нм, 1 дақиқадан бошлаб қўшиб борилади, кун ора, №5', PATTERNS.odd(), true, 'odd', 'uvb', 'age');
  else add('phys', 'UVB 311 нм, начиная с 1 мин и прибавляя, №10', 'UVB 311 нм, 1 дақиқадан бошлаб қўшиб борилади, ҳар куни, №10', PATTERNS.daily(), true, 'daily', 'uvb');
  const excimer = course >= 2 || p.stage === 'stat' || p.setton;
  if (excimer) add('phys', 'Эксимерный лазер 308 нм, через день, №5', 'Эксимер лазер 308 нм, кун ора, №5', PATTERNS.even(), true, 'even', 'excimer', course >= 2 ? `course:${course}` : p.stage === 'stat' ? 'stat' : 'setton');
  if (p.stage === 'prog' && course === 1 && g !== 'u7') add('phys', 'Фототерапия (красный свет) 1 раз в день, начиная с 3 мин, №10', 'Фототерапия (қизил нур) кунига 1 маҳал, 3 дақиқадан бошлаб, №10', PATTERNS.daily(), true, 'daily', 'redlight', 'prog');
  add('phys', 'PRP-терапия, №3', 'PRP-терапия, №3', days([1, 5, 10]), true, 'manual', 'prp');
  if (excimer) {
    if (p.setton) add('phys', 'CO2-лазер на старые очаги и вокруг невуса Сеттона', 'CO2 лазер эски доғларга ва Сеттон невуси атрофига', days([1, 10]), false, 'manual', 'co2', 'setton');
    else add('phys', 'CO2-лазер на старые очаги', 'CO2 лазер эски доғларга', days([1, 10]), false, 'manual', 'co2', course >= 2 ? `course:${course}` : 'stat');
  }

  const rows: DayRow[] = lines.map(([sec, ru, uz, cells, std, pk, key, why]) => ({
    id: rowId(), sec, ru, uz, cells: cells.slice(0, COURSE_DAYS), std, pk, auto: true, key, ...(why ? { why } : {}),
  }));

  // ----- Тавсия: лечение дома после курса -----
  const after: AfterRow[] = [];
  const A = (ru: string, uz: string) => after.push({ id: rowId(), ru, uz, auto: true });
  A(`Дексаметазон 0,5 мг — ${fmt(dex)} таб. в 9:00 по понедельникам и четвергам — до конца 4-й недели`, `Дексаметазон 0,5 мг — ${fmt(dex)} таб. соат 9:00 да душанба ва пайшанба кунлари — 4-ҳафта охиригача`);
  A(`Витамин D ${vd} МЕ 1 раз в 8:00 — 1 месяц`, `Витамин D ${vd} ХБ соат 8:00 да кунига 1 маҳал — 1 ой`);
  if (!kid) {
    A('Эль-форс 1 капс. 2 раза в день — 1 месяц', 'Эль-форс 1 капс. кунига 2 маҳал — 1 ой');
    A('Миномор 1 таб. 1 раз в 9:00 — 1 месяц', 'Миномор 1 таб. соат 9:00 да кунига 1 маҳал — 1 ой');
  } else {
    const iv = g === 'u7' ? 4 : 8;
    A(`Инвиреп капли по ${iv} кап. 2 раза в день — 1 месяц`, `Инвиреп томчи ${iv} томчидан кунига 2 маҳал — 1 ой`);
  }
  if (course === 1) A('Комфодерм мазь 0,1% 1 раз в день вечером — 1 месяц', 'Комфодерм малҳами 0,1% кечқурун кунига 1 маҳал — 1 ой');
  if (tacro) {
    const c = minor ? '0,03%' : '0,1%';
    A(`Такропик мазь ${c} 2 раза в день — 1 месяц`, `Такропик малҳами ${c} кунига 2 маҳал — 1 ой`);
  }
  if (!minor || p.eptaBack) A('EPTA VTLG крем 2 раза в день — постоянно', 'EPTA VTLG крем кунига 2 маҳал — доимий');

  // ----- что подставлено (для панели конструктора) -----
  const chips: Chip[] = [];
  if (opts.prevStart && prev) chips.push({ ru: `Прошлый курс с ${ddmmyy(opts.prevStart)} · дексаметазон ${fmt(prev)} таб.`, uz: `Олдинги курс ${ddmmyy(opts.prevStart)} дан · дексаметазон ${fmt(prev)} таб.` });
  chips.push(prev
    ? { ru: `Дексаметазон ${fmt(prev)} → ${fmt(dex)} таб. (−½ к прошлому курсу)`, uz: `Дексаметазон ${fmt(prev)} → ${fmt(dex)} таб. (олдинги курсдан −½)` }
    : { ru: `Дексаметазон ${fmt(dex)} таб. — по возрасту и номеру курса`, uz: `Дексаметазон ${fmt(dex)} таб. — ёш ва курс рақамига кўра` });
  if (kid) chips.push({ ru: 'До 12 лет: без Юнисенты, Эль-форса и гинкго; + Антрал, Алфавит, Бифолак, Инвиреп; детские дозы', uz: '12 ёшгача: Юнисента, Эль-форс ва гинкгосиз; + Антрал, Алфавит, Бифолак, Инвиреп; болалар дозалари' });
  else if (g === 't') chips.push({ ru: '12–17 лет: без гинкго; Стронгер нео по возрасту', uz: '12–17 ёш: гинкгосиз; Стронгер нео ёшга кўра' });
  else chips.push({ ru: age === null ? 'Год рождения не указан — взрослые дозы' : 'Взрослые дозы', uz: age === null ? 'Туғилган йили кўрсатилмаган — катталар дозаси' : 'Катталар дозаси' });
  if (minor) chips.push({ ru: `Протокол МЗ: Такропик 0,03%${p.eptaBack ? '' : ' · EPTA VTLG убран (с 18 лет)'}`, uz: `ССВ протоколи: Такропик 0,03%${p.eptaBack ? '' : ' · EPTA VTLG олиб ташланди (18 ёшдан)'}` });
  if (course === 1) chips.push({ ru: '1-й курс: Комфодерм, аскорбиновая кислота', uz: '1-курс: Комфодерм, аскорбин кислотаси' });
  else chips.push({ ru: `${course === 4 ? '4-й и далее' : `${course}-й`} курс: Такропик, эксимер, CO2-лазер${course >= 3 ? '; никотиновая кислота вместо аскорбиновой' : ''}`, uz: `${course === 4 ? '4- ва ундан кейинги' : `${course}-`}курс: Такропик, эксимер, CO2 лазер${course >= 3 ? '; аскорбин ўрнига никотин кислотаси' : ''}` });
  if (p.stage === 'stat' && course === 1) chips.push({ ru: 'Стадия ремиссии: Такропик, эксимер и CO2-лазер уже с 1-го курса', uz: 'Ремиссия босқичи: Такропик, эксимер ва CO2 лазер 1-курсдан' });
  if (p.setton) chips.push({ ru: 'Сеттон: CO2-лазер вокруг невуса, эксимер', uz: 'Сеттон: невус атрофига CO2 лазер, эксимер' });

  return { rows, after, chips, dex };
}

const ddmmyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

/**
 * Пересборка листа: строки, которые врач правил вручную или добавил сам, остаются.
 * Строка конструктора, которую правили, заменяет новую строку с тем же ключом.
 */
export function mergeRebuild(old: DayRow[], fresh: DayRow[]): DayRow[] {
  const editedByKey = new Map(old.filter((r) => r.auto && r.edited && r.key).map((r) => [r.key as string, r]));
  const out = fresh.map((r) => editedByKey.get(r.key ?? '') ?? r);
  const keep = old.filter((r) => !r.auto && (r.ru || r.uz));
  const order: DaySection[] = ['drug', 'top', 'phys'];
  for (const r of keep) {
    let at = -1;
    out.forEach((x, i) => { if (x.sec === r.sec) at = i; });
    if (at < 0) {
      const before = out.findIndex((x) => order.indexOf(x.sec) > order.indexOf(r.sec));
      out.splice(before < 0 ? out.length : before, 0, r);
    } else out.splice(at + 1, 0, r);
  }
  return out;
}

/** Курс собран не конструктором (старый шаблон) — при пересборке строки заменяются целиком. */
export const isLegacyVit = (rows: DayRow[]) => rows.length > 0 && !rows.some((r) => r.auto);

// ---------- стандарт МЗ и подсказки ----------

/** Препараты и процедуры стандарта МЗ РУз по витилиго (для строк, введённых вручную). */
const STD_RX = /витамин\s*b|витамин\s*в\b|в[-\s]?комплекс|цианокобал|пиридокс|тиамин|рибофлав|аскорбин|витамин\s*d|витамин\s*д\b|холекальц|альфа[-\s]?липо|тиоктов|цинк|мед[иь]|антрал|дексаметазон|преднизол|метилпредниз|комфодерм|метилпреднизолона ацепонат|дермовейт|клобетазол|мометазон|бетаметазон|флутиказон|такропик|такролимус|протопик|пимекролимус|элидел|руксолит|рутиниб|epta|эпта|витилексин|витиликсин|витасан|vitilsi|uvb|311|эксимер|excimer|308|prp|плазмо|красн\w* свет|фототерап|пува|puva|глутатион|адеметион|урсодез|фосфолип|циклоспорин|метотрексат|барицитиниб/i;

/** true — в стандарте, false — вне стандарта, null — не распознано (пустая строка). */
export function stdOf(name: string): boolean | null {
  const s = (name || '').trim();
  if (!s) return null;
  return STD_RX.test(s);
}

export type HintKind = 'warn' | 'info';
export interface RowHint { kind: HintKind; ru: string; uz: string }

/** Подсказки к строке: дети (Такропик, EPTA VTLG), дексаметазон, Антрал. Видны только на экране. */
export function rowHints(r: DayRow, age: number | null): RowHint[] {
  const name = `${r.ru} ${r.uz}`;
  const out: RowHint[] = [];
  const minor = isChild(age);
  if (minor && /такропик|такролимус|протопик/i.test(name)) {
    if (/0[,.]1\s*%/.test(name)) out.push({ kind: 'warn', ru: 'Детям по протоколу МЗ — Такропик 0,03%. Мазь 0,1% — только взрослым.', uz: 'ССВ протоколи бўйича болаларга — Такропик 0,03%. 0,1% малҳам — фақат катталарга.' });
    else if (r.auto) out.push({ kind: 'info', ru: 'Подставлено по протоколу МЗ: детям — 0,03%. Мазь 0,1% — только взрослым.', uz: 'ССВ протоколи бўйича қўйилди: болаларга — 0,03%. 0,1% малҳам — фақат катталарга.' });
  }
  if (minor && /epta|эпта/i.test(name)) out.push({ kind: 'warn', ru: 'EPTA VTLG по протоколу МЗ — с 18 лет. Назначено под ответственность врача.', uz: 'EPTA VTLG ССВ протоколи бўйича — 18 ёшдан. Шифокор масъулияти остида тайинланди.' });
  if (/дексаметазон/i.test(r.ru) && !/4\s*мг|в\/в/i.test(r.ru)) out.push({ kind: 'info', ru: 'В листе будет сноска: дозу без назначения врача не менять.', uz: 'Варақада изоҳ бўлади: дори дозаси шифокор рухсатисиз ўзгартирилмасин.' });
  if (age !== null && age >= 4 && age <= 10 && /антрал/i.test(name) && !/3\s*раз|3\s*маҳал/i.test(name)) out.push({ kind: 'info', ru: 'Протокол МЗ для 4–10 лет: 100 мг 3 раза в день — проверьте дозу.', uz: '4–10 ёш учун ССВ протоколи: 100 мг кунига 3 маҳал — дозани текширинг.' });
  return out;
}

/** Сноска к дексаметазону на распечатке. */
export const DEX_NOTE: Record<DayLang, string> = {
  ru: 'Дексаметазон: дозу без назначения врача не менять.',
  uz: 'Дексаметазон: дори дозаси шифокор рухсатисиз ўзгартирилмасин.',
};
export const isDexRow = (r: DayRow) => /дексаметазон/i.test(r.ru || r.uz) && !/4\s*мг|в\/в/i.test(r.ru);

/** Повторный осмотр: через N недель после последнего дня курса. */
export function followDate(startDate: string, weeks: number): Date | null {
  if (!weeks) return null;
  const last = courseDates(startDate)[COURSE_DAYS - 1];
  const d = new Date(last);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/** Склонение «год/года/лет». */
export function yearsRu(n: number): string {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return `${n} лет`;
  if (b === 1) return `${n} год`;
  if (b >= 2 && b <= 4) return `${n} года`;
  return `${n} лет`;
}

/** Строки витилиго «по умолчанию» (взрослый, прогрессирующая, 1-й курс) — для курса без данных пациента. */
export function defaultVitRows(startDate: string): DayRow[] {
  return buildVit({ age: null, params: DEFAULT_VIT, startDate }).rows;
}
export function defaultVitAfter(startDate: string): AfterRow[] {
  return buildVit({ age: null, params: DEFAULT_VIT, startDate }).after;
}

/** Рекомендации при пересборке: строки врача остаются, новые строки конструктора — без повторов того же препарата. */
export function mergeAfter(old: AfterRow[] | undefined, fresh: AfterRow[]): AfterRow[] {
  const mine = (old ?? []).filter((r) => !r.auto && (r.ru || r.uz));
  const first = (s: string) => norm(s).split(/[\s—-]/)[0];
  const taken = new Set(mine.map((r) => first(r.ru || r.uz)));
  return [...fresh.filter((r) => !taken.has(first(r.ru))), ...mine];
}
