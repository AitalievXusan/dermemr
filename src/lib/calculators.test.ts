import { describe, expect, it } from 'vitest';
import {
  calcDlqi, calcEasi, calcGags, calcUas7, easiSeverity, uas7Severity, calcPasi, calcScorad, cumulativeDosePerKg, formatAge, gagsSeverity, isotretinoinTarget, pasiSeverity,
} from './calculators';
import { checkDrug } from './cdss';
import { createInitialEncounter } from '../data/mockEncounter';

describe('PASI', () => {
  it('максимум = 72', () => {
    const max = { E: 4, I: 4, D: 4, A: 6 };
    expect(calcPasi({ h: max, u: max, t: max, l: max })).toBe(72);
  });
  it('взвешенная сумма по областям', () => {
    const z = { E: 0, I: 0, D: 0, A: 0 };
    // 0.4 × (3+2+2) × 2 = 5.6
    expect(calcPasi({ h: z, u: z, t: z, l: { E: 3, I: 2, D: 2, A: 2 } })).toBe(5.6);
    expect(pasiSeverity(14.8).label).toBe('средняя степень');
  });
});

describe('SCORAD', () => {
  it('A/5 + 7B/2 + C', () => {
    // 20/5 + 7*9/2 + 10 = 4 + 31.5 + 10 = 45.5
    expect(calcScorad(20, [2, 1, 1, 2, 1, 2], 6, 4)).toBe(45.5);
  });
  it('максимум = 103', () => {
    expect(calcScorad(100, [3, 3, 3, 3, 3, 3], 10, 10)).toBe(103);
  });
});

describe('GAGS', () => {
  it('сумма фактор × степень', () => {
    // 2*2 + 2*3 + 2*2 + 1*1 + 1*2 + 3*0 = 17
    expect(calcGags([2, 3, 2, 1, 2, 0])).toBe(17);
    expect(gagsSeverity(17).label).toBe('легкая степень');
    expect(gagsSeverity(31).label).toBe('тяжелая степень');
  });
});

describe('DLQI', () => {
  it('0..30', () => {
    expect(calcDlqi(Array(10).fill(3))).toBe(30);
  });
});

describe('Изотретиноин (критерий приемки №3)', () => {
  it('60 кг → 7200–9000 мг', () => {
    expect(isotretinoinTarget(60)).toEqual({ minMg: 7200, maxMg: 9000 });
  });
  it('D_cum = Σ(d×t)/m', () => {
    expect(cumulativeDosePerKg([{ dailyDoseMg: 40, days: 90 }, { dailyDoseMg: 60, days: 60 }], 60)).toBe(120);
  });
});

describe('Возраст', () => {
  it('34 г. 4 мес.', () => {
    expect(formatAge('1992-07-10', new Date('2026-11-18'))).toBe('34 г. 4 мес.');
    expect(formatAge('2001-01-01', new Date('2026-11-18'))).toBe('25 л. 10 мес.');
  });
});

describe('CDSS', () => {
  const patient = createInitialEncounter().patient;
  it('блокирует пенициллины при аллергии', () => {
    expect(checkDrug('Амоксициллин', patient).some((a) => a.level === 'BLOCKING_ALERT')).toBe(true);
  });
  it('блокирует лидокаин', () => {
    expect(checkDrug('Лидокаин 2%', patient)[0]?.level).toBe('BLOCKING_ALERT');
  });
  it('тератогены при беременности', () => {
    const pregnant = { ...patient, allergies: [], isPregnantOrLactating: true };
    expect(checkDrug('Изотретиноин', pregnant).some((a) => a.title.includes('Беременность'))).toBe(true);
    expect(checkDrug('Метотрексат', pregnant).length).toBeGreaterThan(0);
  });
  it('пропускает безопасный препарат', () => {
    expect(checkDrug('Мометазона фуроат 0.1%', patient)).toEqual([]);
  });
});

describe('EASI', () => {
  it('максимум = 72, взвешенная сумма', () => {
    const max = { E: 3, I: 3, Ex: 3, L: 3, A: 6 };
    expect(calcEasi({ h: max, u: max, t: max, l: max })).toBe(72);
    const z = { E: 0, I: 0, Ex: 0, L: 0, A: 0 };
    // 0.3 × (2+1+1+1) × 3 = 4.5
    expect(calcEasi({ h: z, u: z, t: { E: 2, I: 1, Ex: 1, L: 1, A: 3 }, l: z })).toBe(4.5);
    expect(easiSeverity(4.5).label).toBe('легкая степень');
  });
});

describe('UAS7', () => {
  it('0..42', () => {
    expect(calcUas7(Array(7).fill([3, 3]) as [number, number][])).toBe(42);
    expect(uas7Severity(20).label).toBe('умеренная активность');
  });
});

describe('CDSS: взаимодействия', () => {
  const patient = { ...createInitialEncounter().patient, allergies: [] };
  it('изотретиноин + доксициклин — блокировка', () => {
    expect(checkDrug('Доксициклин', patient, ['Изотретиноин']).some((a) => a.level === 'BLOCKING_ALERT')).toBe(true);
  });
  it('изотретиноин + адапален — предупреждение', () => {
    const a = checkDrug('Изотретиноин', patient, ['Адапален 0.1%']);
    expect(a.some((x) => x.level === 'WARNING' && x.title.includes('Адапален'))).toBe(true);
  });
  it('изотретиноин + ацитретин — блокировка без дублей', () => {
    const a = checkDrug('Ацитретин', patient, ['Изотретиноин']).filter((x) => x.title.includes('Взаимодействие'));
    expect(a.length).toBe(1);
  });
});
