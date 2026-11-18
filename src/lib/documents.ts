import type { EncounterState, TimeSlot } from '../types';
import { findDrug } from '../data/drugs';
import { ICD10 } from '../data/icd10';
import { MACROS } from '../data/templates';

// Подготовка данных для PDF-шаблонов (SPEC §5.2 «Умная группировка в Mobile PDF»).

export interface DayStep {
  kind: 'care' | 'topical' | 'systemic';
  title: string;
  detail: string;
  form?: string;
}

const CARE_ORDER = (step: string) => {
  const s = step.toLowerCase();
  if (s.includes('очищ')) return 0;
  if (s.includes('увлаж') || s.includes('эмол')) return 2;
  if (s.includes('фото') || s.includes('spf')) return 3;
  return 2;
};

export function groupByTimeOfDay(state: EncounterState): Record<TimeSlot, DayStep[]> {
  const { plan } = state.soap;
  const out: Record<TimeSlot, (DayStep & { order: number })[]> = { MORNING: [], DAY: [], EVENING: [] };
  plan.skincareRoutine.forEach((c) =>
    c.timeOfDaySlot.forEach((slot) =>
      out[slot].push({ kind: 'care', title: c.step, detail: c.productRecommendation, order: CARE_ORDER(c.step) }),
    ),
  );
  plan.topicalTherapy.forEach((t) =>
    t.timeOfDaySlot.forEach((slot) =>
      out[slot].push({
        kind: 'topical',
        title: t.drugName,
        form: t.form,
        detail: [t.applicationZone, t.method, t.durationDays ? `курс ${t.durationDays} дн.` : ''].filter(Boolean).join(' · '),
        order: 1,
      }),
    ),
  );
  plan.extemporalPrescriptions.forEach((x) =>
    x.timeOfDaySlot.forEach((slot) =>
      out[slot].push({
        kind: 'topical',
        title: x.title,
        form: x.form.includes('unguent') ? 'Мазь' : 'Раствор',
        detail: [x.applicationZone, x.sig].filter(Boolean).join(' · '),
        order: 1,
      }),
    ),
  );
  plan.systemicTherapy.forEach((s) =>
    s.timeOfDaySlot.forEach((slot) =>
      out[slot].push({
        kind: 'systemic',
        title: `${s.drugName} ${s.dose}`.trim(),
        form: 'Таблетки',
        detail: [s.regimen, s.mealRelation, s.durationDays ? `курс ${s.durationDays} дн.` : ''].filter(Boolean).join(' · '),
        order: 4,
      }),
    ),
  );
  (Object.keys(out) as TimeSlot[]).forEach((k) => out[k].sort((a, b) => a.order - b.order));
  return out;
}

export function rxDrugs(state: EncounterState) {
  const { plan } = state.soap;
  return [
    ...plan.topicalTherapy.map((t) => ({ name: t.drugName, form: t.form, sig: `${t.frequency}, ${t.applicationZone}. ${t.method}`, days: t.durationDays })),
    ...plan.systemicTherapy.map((s) => ({ name: s.drugName, form: 'Табл.', sig: `${s.dose} ${s.regimen}, ${s.mealRelation}`, days: s.durationDays })),
  ].filter((d) => findDrug(d.name)?.rx);
}

const MEMO_BY_GROUP: [RegExp, string[]][] = [
  [/^L70/, ['акне_ретиноиды', 'спф_режим']],
  [/^L71/, ['розацеа_триггеры', 'спф_режим']],
  [/^L2[0-9]|^L30/, ['правило_ftu', 'тгкс_отмена']],
  [/^L4[0-5]/, ['псориаз_уход']],
  [/^B3[5-7]/, ['микоз_дезинфекция']],
  [/^B0|^L0/, ['пиодермия_режим']],
  [/^D2|^L82|^C4|^L57/, ['abcde', 'спф_режим']],
  [/^L6/, ['алопеция_скрининг']],
  [/^B86/, ['чесотка_схема']],
  [/^L50/, ['крапивница_дневник']],
];

/** Памятка подбирается по коду МКБ-10 (PRD §4.4.2). */
export function memoFor(icd: string) {
  const keys = MEMO_BY_GROUP.find(([re]) => re.test(icd))?.[1] ?? ['спф_режим'];
  return keys.map((k) => MACROS.find((m) => m.key === k)!).filter(Boolean);
}

export const icdName = (code: string) => ICD10.find((e) => e.code === code)?.name ?? '';

/** Пояснение диагноза простым языком для Mobile PDF. */
export function plainDiagnosis(code: string): string {
  if (/^L40/.test(code)) return 'Хроническое неинфекционное воспаление кожи. Не заразно. Хорошо контролируется лечением и уходом.';
  if (/^L70/.test(code)) return 'Воспаление сальных желез и волосяных фолликулов. Лечится курсом 2–3 месяца.';
  if (/^L71/.test(code)) return 'Хроническое воспаление кожи лица с покраснением. Важно избегать провоцирующих факторов.';
  if (/^L20/.test(code)) return 'Хроническое воспаление кожи, связанное с сухостью и нарушением барьера. Не заразно.';
  if (/^D22/.test(code)) return 'Доброкачественное пигментное образование (родинка). Требует периодического самоконтроля.';
  if (/^B35/.test(code)) return 'Грибковая инфекция кожи. Важно пройти курс полностью и обработать обувь.';
  return 'Подробности обсудите с лечащим врачом на контрольном визите.';
}
