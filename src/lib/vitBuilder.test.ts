import { describe, expect, it } from 'vitest';
import { COURSE_DAYS, courseDates, type DayCourse } from '../data/dayHospital';
import {
  DEFAULT_VIT, ageGroup, ageOf, buildVit, dexFromRows, dexTabs, initialParams, mergeAfter, mergeRebuild, rowHints, stageFromDiagnosis, stdOf, vitHistory,
} from '../data/vitBuilder';

const START = '2026-11-30'; // понедельник
const names = (rows: { ru: string }[]) => rows.map((r) => r.ru).join(' | ');

describe('конструктор курса витилиго', () => {
  it('возраст и возрастные группы', () => {
    expect(ageOf('1990', START)).toBe(36);
    expect(ageOf('', START)).toBeNull();
    expect(ageGroup(4)).toBe('u7');
    expect(ageGroup(8)).toBe('c');
    expect(ageGroup(15)).toBe('t');
    expect(ageGroup(null)).toBe('a');
  });

  it('дексаметазон по возрасту и курсу, −½ таб. с каждым курсом', () => {
    expect(dexTabs(4, 1)).toBe(1);
    expect(dexTabs(4, 4)).toBe(0.5);
    expect(dexTabs(8, 1)).toBe(2);
    expect(dexTabs(14, 1)).toBe(3);
    expect(dexTabs(14, 2)).toBe(2.5);
    expect(dexTabs(36, 1)).toBe(4);
    expect(dexTabs(36, 4)).toBe(2.5);
  });

  it('взрослый, 1-й курс, прогрессирующая: каркас, Комфодерм, без Такропика', () => {
    const b = buildVit({ age: 36, params: DEFAULT_VIT, startDate: START });
    const s = names(b.rows);
    expect(b.rows.every((r) => r.cells.length === COURSE_DAYS && r.auto)).toBe(true);
    for (const x of ['Витамин B-комплекс 2,0', 'Юнисента', 'Стронгер нео 20,0', 'Дексаметазон 0,5 мг — 4 таб.', 'Аспаркам 1 таб.', 'Витамин D 5000', 'Эль-форс', 'Альфа-липоевая', 'Гинкго', 'Комфодерм', 'EPTA VTLG', 'UVB 311', 'PRP', 'Фототерапия']) expect(s).toContain(x);
    expect(s.includes('Такропик')).toBe(false);
    expect(s.includes('CO2')).toBe(false);
    const dex = b.rows.find((r) => r.key === 'dex')!;
    // пн 30.11 и чт 03.12, пн 07.12, чт 10.12
    expect(dex.cells).toEqual(['4', '', '', '4', '', '', '4', '', '', '4']);
    expect(b.after.length).toBeGreaterThan(3);
  });

  it('2-й курс: Такропик, эксимер, CO2; доза дексаметазона −½ от прошлого курса', () => {
    const b = buildVit({ age: 36, params: { ...DEFAULT_VIT, course: 2 }, startDate: START, prevDex: 3, prevStart: '2026-10-05' });
    const s = names(b.rows);
    for (const x of ['Такропик мазь 0,1%', 'Эксимерный', 'CO2-лазер', '2,5 таб.']) expect(s).toContain(x);
    expect(s.includes('Комфодерм')).toBe(false);
    expect(b.rows.find((r) => r.key === 'dex')!.why).toBe('dex:3:2,5');
  });

  it('ребёнок 8 лет: детские дозы, без Юнисенты; Такропик 0,03%; EPTA VTLG убран, врач может вернуть', () => {
    const b = buildVit({ age: 8, params: { ...DEFAULT_VIT, stage: 'stat' }, startDate: START });
    const s = names(b.rows);
    for (const x of ['Витамин B-комплекс 1,0', 'Витамин D 2000', 'Стронгер нео 10,0', 'Антрал', 'Алфавит «Школьник»', 'Бифолак', 'Инвиреп', 'Такропик мазь 0,03%', 'Дексаметазон 0,5 мг — 2 таб.']) expect(s).toContain(x);
    for (const x of ['Юнисента', 'Эль-форс', 'Гинкго', 'EPTA', 'Такропик мазь 0,1%']) expect(s.includes(x)).toBe(false);
    const back = buildVit({ age: 8, params: { ...DEFAULT_VIT, stage: 'stat', eptaBack: true }, startDate: START });
    expect(names(back.rows)).toContain('EPTA VTLG');
    expect(rowHints(back.rows.find((r) => r.key === 'epta')!, 8)[0].kind).toBe('warn');
  });

  it('подросток: Такропик по протоколу МЗ 0,03%, подсказка на 0,1%', () => {
    const b = buildVit({ age: 15, params: { ...DEFAULT_VIT, course: 2 }, startDate: START });
    expect(names(b.rows)).toContain('Такропик мазь 0,03%');
    expect(names(b.rows).includes('EPTA')).toBe(false);
    const manual = { ...b.rows[0], ru: 'Такропик мазь 0,1% 2 раза', uz: '', auto: false };
    expect(rowHints(manual, 15)[0].kind).toBe('warn');
  });

  it('Сеттон: CO2 вокруг невуса и эксимер уже в 1-м курсе', () => {
    const s = names(buildVit({ age: 20, params: { ...DEFAULT_VIT, setton: true }, startDate: START }).rows);
    expect(s).toContain('невуса Сеттона');
    expect(s).toContain('Эксимерный');
    expect(s).toContain('Миномор');
  });

  it('пересборка сохраняет строки, которые врач правил или добавил', () => {
    const a = buildVit({ age: 36, params: DEFAULT_VIT, startDate: START }).rows;
    const edited = a.map((r) => (r.key === 'vitd' ? { ...r, ru: 'Витамин D 10000 МЕ', edited: true } : r));
    const mine = { ...a[0], id: 'x', ru: 'Мой препарат', auto: false, key: undefined, sec: 'top' as const };
    const fresh = buildVit({ age: 36, params: { ...DEFAULT_VIT, course: 2 }, startDate: START }).rows;
    const out = mergeRebuild([...edited, mine], fresh);
    expect(names(out)).toContain('Витамин D 10000 МЕ');
    expect(names(out)).toContain('Мой препарат');
    expect(names(out)).toContain('Такропик');
    expect(out.filter((r) => r.key === 'vitd')).toHaveLength(1);
  });

  it('рекомендации: строки врача остаются при пересборке', () => {
    const fresh = buildVit({ age: 36, params: DEFAULT_VIT, startDate: START }).after;
    const out = mergeAfter([{ id: 'm', ru: 'Витамин D 2000 МЕ — 3 месяца', uz: '' }, ...fresh], fresh);
    expect(out.filter((r) => r.ru.startsWith('Витамин D'))).toHaveLength(1);
    expect(out[out.length - 1].ru).toBe('Витамин D 2000 МЕ — 3 месяца');
  });

  it('номер курса и доза по прошлому курсу пациента', () => {
    const mk = (id: string, startDate: string, rows = buildVit({ age: 36, params: DEFAULT_VIT, startDate }).rows): DayCourse => ({
      id, encounterId: null, patientId: null, fio: 'Рахимова Лайло', birthYear: '1990', phone: '', diagnosis: 'Витилиго, стадия ремиссии', doctor: '',
      startDate, template: 'vit', lang: 'ru', rows, status: 'DONE', createdAt: startDate, updatedAt: startDate,
    });
    const prev = mk('a', '2026-10-05');
    const cur = mk('b', START, []);
    const h = vitHistory(cur, [prev, cur, { ...mk('c', '2026-09-01'), fio: 'Другой пациент' }]);
    expect(h.count).toBe(1);
    expect(h.lastDex).toBe(4);
    expect(dexFromRows(prev.rows)).toBe(4);
    const p = initialParams(cur, h);
    expect(p.course).toBe(2);
    expect(p.stage).toBe('stat');
    expect(stageFromDiagnosis('Витилиго, прогрессирующая стадия')).toBe('prog');
  });

  it('стандарт МЗ для строк, введённых вручную', () => {
    expect(stdOf('Такропик мазь 0,1%')).toBe(true);
    expect(stdOf('Стронгер нео 20,0')).toBe(false);
    expect(stdOf('')).toBeNull();
    expect(courseDates(START)[0].getDay()).toBe(1);
  });
});
