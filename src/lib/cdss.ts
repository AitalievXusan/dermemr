import { findDrug, type DrugEntry } from '../data/drugs';
import type { Patient } from '../types';

export interface CdssAlert {
  level: 'BLOCKING_ALERT' | 'WARNING';
  title: string;
  message: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Клиент-side дубль POST /api/v1/cdss/check (SPEC §3.3):
 * 1) МНН/группа против аллергоанамнеза; 2) тератогены при беременности/лактации.
 */
// Межлекарственные взаимодействия (минимальная клиническая база для дерматологии).
// b_topical: правило срабатывает, только если препарат группы B — наружный.
const INTERACTIONS: { a: string; b: string; level: CdssAlert['level']; message: string; bTopical?: boolean }[] = [
  { a: 'системные ретиноиды', b: 'тетрациклины', level: 'BLOCKING_ALERT', message: 'Системные ретиноиды + тетрациклины: риск доброкачественной внутричерепной гипертензии.' },
  { a: 'системные ретиноиды', b: 'системные ретиноиды', level: 'BLOCKING_ALERT', message: 'Одновременное назначение двух системных ретиноидов недопустимо (гипервитаминоз A).' },
  { a: 'цитостатики', b: 'системные ретиноиды', level: 'BLOCKING_ALERT', message: 'Метотрексат + системный ретиноид: высокий риск гепатотоксичности.' },
  { a: 'цитостатики', b: 'пенициллины', level: 'WARNING', message: 'Метотрексат + пенициллины: снижение клиренса метотрексата, контроль ОАК и креатинина.' },
  { a: 'системные ретиноиды', b: 'ретиноиды', level: 'WARNING', message: 'Системный + топический ретиноид: выраженный ретиноидный дерматит, используйте с осторожностью.', bTopical: true },
  { a: 'азолы', b: 'цитостатики', level: 'WARNING', message: 'Итраконазол может повышать токсичность метотрексата.' },
];

export function checkDrug(drugName: string, patient: Patient, currentDrugs: string[] = []): CdssAlert[] {
  const alerts: CdssAlert[] = [];
  const drug = findDrug(drugName);
  const haystack = [norm(drugName), ...(drug ? [drug.inn, ...drug.groups.map(norm)] : [])];

  for (const allergy of patient.allergies) {
    const a = norm(allergy);
    const stem = a.slice(0, Math.max(5, a.length - 2)); // «пенициллины» → «пеницилли»
    if (haystack.some((h) => h.includes(stem) || stem.includes(h))) {
      alerts.push({
        level: 'BLOCKING_ALERT',
        title: 'Аллергия в анамнезе',
        message: `У пациента указана аллергия: «${allergy}». Препарат «${drugName}» относится к группе ${drug ? drug.groups.join(', ') : 'с перекрестной реакцией'}.`,
      });
    }
  }

  if (drug?.teratogenic && patient.isPregnantOrLactating) {
    alerts.push({
      level: 'BLOCKING_ALERT',
      title: 'Беременность / лактация',
      message: `«${drugName}» — препарат с тератогенным действием (${drug.groups[0]}). Назначение при беременности и лактации противопоказано.`,
    });
  }

  if (drug?.inn === 'isotretinoin' && !patient.isPregnantOrLactating && patient.sex === 'F') {
    alerts.push({
      level: 'WARNING',
      title: 'Программа предупреждения беременности',
      message: 'Перед стартом необходим отрицательный тест на ХГЧ и две формы контрацепции. Используйте макрос /изотретиноин_старт.',
    });
  }

  if (drug) {
    const seen = new Set<string>();
    for (const name of currentDrugs) {
      const other = findDrug(name);
      if (!other || other.name === drug.name) continue;
      for (const r of INTERACTIONS) {
        const pair = (x: DrugEntry, y: DrugEntry) => x.groups.includes(r.a) && y.groups.includes(r.b) && (!r.bTopical || y.route === 'topical');
        if (!pair(drug, other) && !pair(other, drug)) continue;
        const key = r.message + other.name;
        if (seen.has(key)) continue;
        seen.add(key);
        alerts.push({ level: r.level, title: `Взаимодействие с «${other.name}»`, message: r.message });
      }
    }
  }

  return alerts;
}
