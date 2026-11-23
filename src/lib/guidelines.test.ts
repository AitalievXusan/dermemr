import { describe, expect, it } from 'vitest';
import data from '../data/guidelines.json';
import { drugInGuideline, drugKey, guessTopicalForm, matchGuidelines, parseDurationDays, parseFrequency, type Guideline } from './guidelines';

const G = data as unknown as Guideline[];

describe('справочник протоколов МЗ РУз', () => {
  it('содержит нозологии с препаратами и ссылками на источники', () => {
    expect(G.length).toBeGreaterThanOrEqual(32);
    for (const g of G) {
      expect(g.drugs.length).toBeGreaterThan(0);
      expect(g.std.file).toMatch(/\.pdf$/);
    }
  });

  it('находит протокол по коду МКБ-10 и по рубрике', () => {
    expect(matchGuidelines(G, 'L40.0').map((g) => g.id)).toEqual(['psoriasis']);
    expect(matchGuidelines(G, 'L40').map((g) => g.id)).toEqual(['psoriasis']);
    expect(matchGuidelines(G, 'L71.0').map((g) => g.id)).toEqual(['perioral']);
    expect(matchGuidelines(G, 'L71.9').map((g) => g.id)).toEqual(['rosacea']);
    expect(matchGuidelines(G, 'B35.0').map((g) => g.id).sort()).toEqual(['microsporia', 'trichophytosis']);
    expect(matchGuidelines(G, 'L70.0')).toEqual([]);
  });

  it('сверяет назначения со стандартом по основе МНН', () => {
    const ps = G.find((g) => g.id === 'psoriasis')!;
    expect(drugKey('Мометазона фуроат 0.1%')).toBe('мометаз');
    expect(drugInGuideline(ps, 'Мометазона фуроат 0.1%')).toBe(true);
    expect(drugInGuideline(ps, 'Кальципотриол + Бетаметазон (50 мкг + 0.5 мг/г)')).toBe(true);
    expect(drugInGuideline(ps, 'Ивермектин 1%')).toBe(false);
  });
});

describe('разбор текста стандарта', () => {
  it('кратность', () => {
    expect(parseFrequency('наружно 1–2 раза в сутки; в течение 2–4 – х недель')).toBe('1–2 раза в сутки');
    expect(parseFrequency('наружно 1 раз в сутки')).toBe('1 раз в сутки');
    expect(parseFrequency('Наносят на пораженные участки кожи 2 раза/сут.')).toBe('2 раза в сутки');
    expect(parseFrequency('3 раза в неделю перед сном')).toBe('3 раза в неделю');
    expect(parseFrequency('Индивидуально')).toBe('');
  });

  it('длительность курса в днях', () => {
    expect(parseDurationDays('в течение 2–4 – х недель')).toBe(28);
    expect(parseDurationDays('перорально 1 раз в сутки 7-14 дней')).toBe(14);
    expect(parseDurationDays('в течение 6 месяцев')).toBe(180);
    expect(parseDurationDays('Индивидуально')).toBeNull();
  });

  it('лекарственная форма', () => {
    expect(guessTopicalForm('Такролимус 0,03% и 0,1% мазь', '')).toBe('Мазь');
    expect(guessTopicalForm('Циклопироксоламин, лак для ногтей 8%', '')).toBe('Лак');
    expect(guessTopicalForm('Кальципотриол', 'наружно 2 раза в сутки')).toBe('Крем');
  });
});
