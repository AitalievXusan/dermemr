// Математика клинических калькуляторов — SPEC §4.2, PRD §4.2.3, §4.3.1, критерий приемки №3.

export type PasiRegion = 'h' | 'u' | 't' | 'l';
export interface PasiRegionInput {
  E: number; // эритема 0..4
  I: number; // инфильтрация 0..4
  D: number; // шелушение 0..4
  A: number; // площадь 0..6
}
export const PASI_WEIGHTS: Record<PasiRegion, number> = { h: 0.1, u: 0.2, t: 0.3, l: 0.4 };
export const PASI_REGION_LABELS: Record<PasiRegion, string> = {
  h: 'Голова',
  u: 'Верхние конечности',
  t: 'Туловище',
  l: 'Нижние конечности',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function calcPasi(input: Record<PasiRegion, PasiRegionInput>): number {
  let sum = 0;
  (Object.keys(PASI_WEIGHTS) as PasiRegion[]).forEach((r) => {
    const { E, I, D, A } = input[r];
    sum += PASI_WEIGHTS[r] * (clamp(E, 0, 4) + clamp(I, 0, 4) + clamp(D, 0, 4)) * clamp(A, 0, 6);
  });
  return round1(clamp(sum, 0, 72));
}

export function pasiSeverity(score: number): { label: string; level: 0 | 1 | 2 } {
  if (score < 10) return { label: 'легкая степень', level: 0 };
  if (score <= 20) return { label: 'средняя степень', level: 1 };
  return { label: 'тяжелая степень', level: 2 };
}

/** SCORAD = A/5 + 7B/2 + C. A — площадь, %; B — сумма 6 признаков (0..3 каждый); C — зуд + сон (0..10 каждый). */
export function calcScorad(areaPercent: number, intensity: number[], itch: number, sleep: number): number {
  const A = clamp(areaPercent, 0, 100);
  const B = clamp(intensity.slice(0, 6).reduce((s, v) => s + clamp(v, 0, 3), 0), 0, 18);
  const C = clamp(itch, 0, 10) + clamp(sleep, 0, 10);
  return round1(clamp(A / 5 + (7 * B) / 2 + C, 0, 103));
}

export function scoradSeverity(score: number): { label: string; level: 0 | 1 | 2 } {
  if (score < 25) return { label: 'легкая степень', level: 0 };
  if (score <= 50) return { label: 'средняя степень', level: 1 };
  return { label: 'тяжелая степень', level: 2 };
}

export const GAGS_ZONES = [
  { key: 'forehead', label: 'Лоб', factor: 2 },
  { key: 'rcheek', label: 'Правая щека', factor: 2 },
  { key: 'lcheek', label: 'Левая щека', factor: 2 },
  { key: 'nose', label: 'Нос', factor: 1 },
  { key: 'chin', label: 'Подбородок', factor: 1 },
  { key: 'chest', label: 'Грудь / верх спины', factor: 3 },
] as const;
export const GAGS_GRADES = ['нет', 'комедон', 'папула', 'пустула', 'узел'];

export function calcGags(grades: number[]): number {
  return GAGS_ZONES.reduce((s, z, i) => s + z.factor * clamp(grades[i] ?? 0, 0, 4), 0);
}

export function gagsSeverity(score: number): { label: string; level: 0 | 1 | 2 } {
  if (score === 0) return { label: 'нет поражения', level: 0 };
  if (score <= 18) return { label: 'легкая степень', level: 0 };
  if (score <= 30) return { label: 'средняя степень', level: 1 };
  if (score <= 38) return { label: 'тяжелая степень', level: 2 };
  return { label: 'очень тяжелая степень', level: 2 };
}

export const DLQI_QUESTIONS = [
  'Зуд, болезненность, жжение',
  'Смущение, неловкость',
  'Покупки, домашние дела',
  'Выбор одежды',
  'Общение, досуг',
  'Спорт',
  'Работа / учеба',
  'Отношения с близкими',
  'Сексуальная жизнь',
  'Неудобства лечения',
];

export function calcDlqi(answers: number[]): number {
  return answers.slice(0, 10).reduce((s, v) => s + clamp(v, 0, 3), 0);
}

export function dlqiSeverity(score: number): { label: string; level: 0 | 1 | 2 } {
  if (score <= 1) return { label: 'не влияет', level: 0 };
  if (score <= 5) return { label: 'небольшое влияние', level: 0 };
  if (score <= 10) return { label: 'умеренное влияние', level: 1 };
  if (score <= 20) return { label: 'очень сильное влияние', level: 2 };
  return { label: 'чрезвычайно сильное влияние', level: 2 };
}

/** Доля шкалы 0..1 → цвет градиента тяжести (DESIGN §2.2). */
export function severityColor(fraction: number): string {
  const f = clamp(fraction, 0, 1);
  if (f <= 0.25) return 'var(--sev-mild)';
  if (f <= 0.6) return 'var(--sev-moderate)';
  return 'var(--sev-severe)';
}

/** Позиция индикатора на градиентной шкале по уровню тяжести и баллу. */
export function severityFraction(level: 0 | 1 | 2, scoreInLevel: number): number {
  const bands: [number, number][] = [
    [0, 0.25],
    [0.26, 0.6],
    [0.61, 1],
  ];
  const [lo, hi] = bands[level];
  return lo + (hi - lo) * clamp(scoreInLevel, 0, 1);
}

// ---------- Изотретиноин ----------
export interface IsotretinoinStage {
  dailyDoseMg: number;
  days: number;
}

/** D_cum (мг/кг) = Σ(d_i × t_i) / m */
export function cumulativeDosePerKg(stages: IsotretinoinStage[], weightKg: number): number {
  if (weightKg <= 0) return 0;
  const totalMg = stages.reduce((s, st) => s + st.dailyDoseMg * st.days, 0);
  return round1(totalMg / weightKg);
}

export function isotretinoinTarget(weightKg: number): { minMg: number; maxMg: number } {
  return { minMg: Math.round(weightKg * 120), maxMg: Math.round(weightKg * 150) };
}

// ---------- Возраст ----------
export function formatAge(birthIso: string, now = new Date()): string {
  const b = new Date(birthIso);
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yWord = y % 10 === 1 && y % 100 !== 11 ? 'г.' : 'л.';
  const yStr = `${y} ${y % 10 >= 2 && y % 10 <= 4 && (y % 100 < 10 || y % 100 >= 20) ? 'г.' : yWord}`;
  return m ? `${yStr} ${m} мес.` : yStr;
}

// ---------- EASI (Eczema Area and Severity Index) ----------
export type EasiRegion = 'h' | 'u' | 't' | 'l';
export interface EasiRegionInput {
  E: number; // эритема 0..3
  I: number; // отек / папулы 0..3
  Ex: number; // экскориации 0..3
  L: number; // лихенификация 0..3
  A: number; // площадь 0..6
}
/** Веса для взрослых и детей ≥ 8 лет; для детей 0–7 лет: голова 0.2, нижние конечности 0.3. */
export function easiWeights(child0to7: boolean): Record<EasiRegion, number> {
  return child0to7 ? { h: 0.2, u: 0.2, t: 0.3, l: 0.3 } : { h: 0.1, u: 0.2, t: 0.3, l: 0.4 };
}
export function calcEasi(input: Record<EasiRegion, EasiRegionInput>, child0to7 = false): number {
  const w = easiWeights(child0to7);
  let sum = 0;
  (Object.keys(w) as EasiRegion[]).forEach((r) => {
    const { E, I, Ex, L, A } = input[r];
    sum += w[r] * (clamp(E, 0, 3) + clamp(I, 0, 3) + clamp(Ex, 0, 3) + clamp(L, 0, 3)) * clamp(A, 0, 6);
  });
  return round1(clamp(sum, 0, 72));
}
export function easiSeverity(score: number): { label: string; level: 0 | 1 | 2 } {
  if (score === 0) return { label: 'чистая кожа', level: 0 };
  if (score <= 1) return { label: 'почти чистая кожа', level: 0 };
  if (score <= 7) return { label: 'легкая степень', level: 0 };
  if (score <= 21) return { label: 'средняя степень', level: 1 };
  if (score <= 50) return { label: 'тяжелая степень', level: 2 };
  return { label: 'очень тяжелая степень', level: 2 };
}

// ---------- UAS7 (Urticaria Activity Score, 7 дней) ----------
/** days: 7 пар [волдыри 0..3, зуд 0..3] */
export function calcUas7(days: [number, number][]): number {
  return days.slice(0, 7).reduce((s, [w, i]) => s + clamp(w, 0, 3) + clamp(i, 0, 3), 0);
}
export function uas7Severity(score: number): { label: string; level: 0 | 1 | 2 } {
  if (score === 0) return { label: 'нет симптомов', level: 0 };
  if (score <= 6) return { label: 'хорошо контролируемая', level: 0 };
  if (score <= 15) return { label: 'легкая активность', level: 0 };
  if (score <= 27) return { label: 'умеренная активность', level: 1 };
  return { label: 'выраженная активность', level: 2 };
}
