import { ICD10, type Icd10Entry } from './icd10';
import { PRICE_LIST, type PriceEntry } from './priceList';
import { DRUGS, type DrugEntry } from './drugs';
import { MACROS, QUICK_TEMPLATES, TEMPLATE_LIBRARY, type Macro, type NosologyTemplate } from './templates';
import { EXTEMPORAL_TEMPLATES, type ExtemporalTemplate } from './extemporal';

// Справочники. Источник истины — сервер (редактируются в storage/db.json → dictionaries);
// встроенные значения используются при первом запуске и в режиме без сервера.
export interface Dictionaries {
  icd10: Icd10Entry[];
  priceList: PriceEntry[];
  drugs: DrugEntry[];
  macros: Macro[];
  extemporal: ExtemporalTemplate[];
  templates: NosologyTemplate[];
}

export const builtinDictionaries = (): Dictionaries => ({
  icd10: [...ICD10],
  priceList: [...PRICE_LIST],
  drugs: [...DRUGS],
  macros: [...MACROS],
  extemporal: [...EXTEMPORAL_TEMPLATES],
  templates: [...TEMPLATE_LIBRARY],
});

const replace = <T,>(target: T[], next: T[] | undefined) => {
  if (Array.isArray(next) && next.length) target.splice(0, target.length, ...next);
};

/** Подменяет содержимое модульных массивов, чтобы весь код продолжал работать синхронно. */
export function applyDictionaries(d: Partial<Dictionaries>) {
  replace(ICD10, d.icd10);
  replace(PRICE_LIST, d.priceList);
  replace(DRUGS, d.drugs);
  replace(MACROS, d.macros);
  replace(EXTEMPORAL_TEMPLATES, d.extemporal);
  if (d.templates?.length) {
    replace(TEMPLATE_LIBRARY, d.templates);
    replace(QUICK_TEMPLATES, d.templates.filter((t) => t.quickLabel));
  }
}
