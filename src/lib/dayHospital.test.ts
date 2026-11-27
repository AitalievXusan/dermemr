import { describe, expect, it } from 'vitest';
import { COURSE_DAYS, PATTERNS, courseDates, courseDay, ddmm, isIsotretinoin, nextMark, templateForIcd, templateRows } from '../data/dayHospital';

describe('дневной стационар', () => {
  it('10 рабочих дней без воскресений', () => {
    const d = courseDates('2026-11-23');
    expect(d).toHaveLength(COURSE_DAYS);
    expect(d.some((x) => x.getDay() === 0)).toBe(false);
    expect(d.map(ddmm)).toEqual(['23.11', '24.11', '25.11', '26.11', '27.11', '28.11', '30.11', '01.12', '02.12', '03.12']);
  });

  it('старт в воскресенье переносится на понедельник', () => {
    expect(ddmm(courseDates('2026-11-29')[0])).toBe('30.11');
  });

  it('номер дня курса', () => {
    expect(courseDay('2026-11-23', new Date(2026, 10, 22))).toBe(0);
    expect(courseDay('2026-11-23', new Date(2026, 10, 30))).toBe(7);
    expect(courseDay('2026-11-23', new Date(2026, 11, 10))).toBe(COURSE_DAYS + 1);
  });

  it('схемы «через день» дополняют друг друга', () => {
    expect(PATTERNS.odd().slice(0, 4)).toEqual(['+', '-', '+', '-']);
    expect(PATTERNS.even().slice(0, 4)).toEqual(['-', '+', '-', '+']);
  });

  it('клетка переключается: пусто → + → − → пусто', () => {
    expect(nextMark('')).toBe('+');
    expect(nextMark('+')).toBe('-');
    expect(nextMark('-')).toBe('');
    expect(nextMark('1,0')).toBe('+');
  });

  it('шаблон по МКБ-10 и предупреждение для изотретиноина', () => {
    expect(templateForIcd('L80')).toBe('vit');
    expect(templateForIcd('L70.0')).toBe('acne');
    expect(templateForIcd('L40.0')).toBe('empty');
    expect(templateRows('acne').some((r) => isIsotretinoin(r.ru) && isIsotretinoin(r.uz))).toBe(true);
    expect(templateRows('vit')).toHaveLength(0); // витилиго собирает конструктор
  });
});
