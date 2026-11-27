import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COURSE_DAYS, NOS_KEYS } from '../data/dayHospital';
import {
  NOSOLOGIES, QUICK_NOS, buildNos, defaultLabs, formForIcd, initialNosParams, nosHints, sexOf, stdInGuide, templateForIcd,
} from '../data/nosologies';
import { mergeRebuild } from '../data/vitBuilder';
import guides from '../data/guidelines.json';
import sheets from '../data/dhSheets.json';
import { pdfSlug } from './guidelines';

type G = { title: string; drugs: { g: string; n: string }[]; kp: { file: string } | null; std: { file: string } | null; extra: { file: string }[] };
const G = guides as unknown as G[];
const guide = (t: string) => G.find((g) => g.title === t) ?? null;

describe('нозологии дневного стационара', () => {
  it('каталог совпадает с NOS_KEYS, быстрые кнопки — витилиго, акне, эпидермофития, алопеция, постакне, пустой', () => {
    expect(NOSOLOGIES.map((n) => n.key).sort()).toEqual([...NOS_KEYS].sort());
    expect(QUICK_NOS.map((n) => n.key)).toEqual(['vit', 'acne', 'postacne', 'alopecia', 'mycosis', 'empty']);
  });

  it('протоколы из каталога есть в справочнике', () => {
    for (const n of NOSOLOGIES) {
      if (n.guide) expect(guide(n.guide), n.guide).not.toBeNull();
      for (const f of n.forms ?? []) if (f.guide) expect(guide(f.guide), f.guide).not.toBeNull();
    }
  });

  it('шаблон и форма по МКБ-10', () => {
    expect(templateForIcd('L73.2')).toBe('hidra');
    expect(templateForIcd('L73.8')).toBe('follic');
    expect(templateForIcd('L90.5')).toBe('postacne');
    expect(templateForIcd('B35.3')).toBe('mycosis');
    expect(templateForIcd('L63.9')).toBe('alopecia');
    expect(formForIcd('alopecia', 'L63.9')).toBe('aa');
    expect(formForIcd('alopecia', 'L64')).toBe('aga');
    expect(formForIcd('psor', 'L40.4')).toBe('gutt');
    expect(formForIcd('psor', 'L40.3')).toBe('palm');
  });

  it('каждая нозология собирается: 10 клеток, ключи, без пустых строк', () => {
    for (const n of NOSOLOGIES) {
      if (n.key === 'vit' || n.key === 'empty') continue;
      for (const age of [5, 9, 15, 40, null]) {
        const forms = n.forms?.map((f) => f.v) ?? [undefined];
        for (const form of forms) {
          const b = buildNos({ key: n.key, age, params: { form, stage: 'prog', minox: '5', proc: 'alt' } });
          expect(b.rows.length, `${n.key} ${form} ${age}`).toBeGreaterThan(3);
          for (const r of b.rows) {
            expect(r.cells).toHaveLength(COURSE_DAYS);
            expect(r.ru && r.uz && r.key).toBeTruthy();
            expect(r.cells.every((c) => c.length <= 8)).toBe(true);
          }
        }
      }
    }
  });

  it('псориаз: стадии — Дермовейт при прогрессирующей, Комфодерм при ремиссии и регрессирующей; каплевидная — азитромицин', () => {
    const steroid = (stage: 'prog' | 'stat' | 'regr') => buildNos({ key: 'psor', age: 40, params: { form: 'vulg', stage } }).rows.find((r) => r.key === 'steroid')?.ru ?? '';
    expect(steroid('prog')).toMatch(/Дермовейт/);
    expect(steroid('stat')).toMatch(/Комфодерм/);
    expect(steroid('regr')).toMatch(/Комфодерм/);
    expect(buildNos({ key: 'psor', age: 40, params: { form: 'gutt', stage: 'prog' } }).rows.some((r) => r.key === 'azithro')).toBe(true);
    expect(buildNos({ key: 'psor', age: 40, params: { form: 'vulg', stage: 'prog' } }).rows.some((r) => r.key === 'acyclovir')).toBe(true);
  });

  it('алопеция: миноксидил 5% / 2% / не назначать', () => {
    const mx = (minox: '5' | '2' | '0') => buildNos({ key: 'alopecia', age: 30, params: { form: 'aga', minox } }).rows.find((r) => r.key === 'minox');
    expect(mx('5')?.ru).toMatch(/5%/);
    expect(mx('2')?.ru).toMatch(/2%/);
    expect(mx('0')).toBeUndefined();
    expect(initialNosParams({ template: 'alopecia', diagnosis: '', sex: 'F', fio: '' }, 0).minox).toBe('2');
    const p = initialNosParams({ template: 'alopecia', diagnosis: '', sex: '', fio: 'Каримов Ислам' }, 1);
    expect(p.minox).toBe('5');
    expect(p.course).toBe(2);
  });

  it('дети: без Юнисенты и гинкго, + Антрал и Бифолак, Такропик 0,03%', () => {
    const kid = buildNos({ key: 'toxi', age: 8, params: {} }).rows;
    expect(kid.some((r) => r.key === 'unicenta')).toBe(false);
    expect(kid.some((r) => r.key === 'antral')).toBe(true);
    expect(kid.find((r) => r.key === 'tacro')?.ru).toMatch(/0,03%/);
    expect(buildNos({ key: 'eczema', age: 15, params: { form: 'tylotic' } }).rows.some((r) => r.key === 'ginkgo')).toBe(false);
  });

  it('пересборка сохраняет строки, исправленные врачом', () => {
    const b1 = buildNos({ key: 'psor', age: 40, params: { form: 'vulg', stage: 'prog' } }).rows;
    const edited = b1.map((r) => (r.key === 'les' ? { ...r, ru: 'Лесетрин ½ таб.', edited: true } : r));
    const b2 = buildNos({ key: 'psor', age: 40, params: { form: 'vulg', stage: 'stat' } }).rows;
    const merged = mergeRebuild(edited, b2);
    expect(merged.find((r) => r.key === 'les')?.ru).toBe('Лесетрин ½ таб.');
    expect(merged.find((r) => r.key === 'steroid')?.ru).toMatch(/Комфодерм/);
  });

  it('анализы: ВЭБ при противовирусных, АСЛ-О при каплевидном', () => {
    const rows = buildNos({ key: 'psor', age: 40, params: { form: 'gutt' } }).rows;
    const labs = defaultLabs('psor', rows, 'gutt');
    expect(labs.includes('ebv') && labs.includes('aslo')).toBe(true);
  });

  it('стандарт МЗ: клобетазол при псориазе в стандарте, процедуры распознаются', () => {
    const g = guide('Псориаз');
    expect(stdInGuide(g, { sec: 'top', ru: 'Дермовейт (клобетазол 0,05%) крем' })).toBe(true);
    expect(stdInGuide(g, { sec: 'phys', ru: 'UVB 311 нм через день' })).toBe(true);
    expect(stdInGuide(null, { sec: 'drug', ru: 'Что-то' })).toBeNull();
  });

  it('подсказки: ВЭБ, миноксидил 5% женщине, проба для антибиотиков', () => {
    const row = (ru: string) => ({ id: 'x', sec: 'drug' as const, ru, uz: '', cells: [], std: null, pk: 'home' as const });
    expect(nosHints(row('Ацикловир 200 мг'), 40, 'M')[0].ru).toMatch(/ВЭБ/);
    expect(nosHints(row('Миноксидил 5% раствор'), 30, 'F').some((h) => h.kind === 'warn')).toBe(true);
    expect(nosHints(row('Цефтриаксон 1,0'), 30, 'M')[0].kind).toBe('warn');
    expect(sexOf({ sex: '', fio: 'Каримова Мадина' })).toBe('F');
  });

  it('PDF протоколов и стандартов лежат в public/guidelines под латинскими именами', () => {
    const files = new Set<string>();
    for (const g of G) {
      if (g.kp) files.add(g.kp.file);
      if (g.std) files.add(g.std.file);
      for (const e of g.extra) files.add(e.file);
    }
    const have = new Set(readdirSync('public/guidelines'));
    for (const f of files) expect(have.has(pdfSlug(f)), f).toBe(true);
    expect(existsSync('public/guidelines')).toBe(true);
  });

  it('прежние листы обезличены: нет телефонов и полей с ФИО', () => {
    const list = sheets as unknown as { ini: string; rows: { t: string; c: string[] }[] }[];
    expect(list.length).toBeGreaterThan(150);
    const text = JSON.stringify(list);
    expect(text).not.toMatch(/(?:\+?998)?[\s-]?\(?9\d\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/);
    expect(text).not.toMatch(/"fio"|"phone"|Тел[:.]/);
    for (const s of list) expect(s.ini.length).toBeLessThanOrEqual(6);
  });
});
