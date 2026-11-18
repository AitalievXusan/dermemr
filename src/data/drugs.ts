// Справочник препаратов для автокомплита и CDSS (мок). group — фармакологическая группа,
// по которой выполняется кросс-проверка с аллергоанамнезом (SPEC §3.3).
export interface DrugEntry {
  name: string;
  inn: string;
  groups: string[];
  teratogenic?: boolean;
  rx?: boolean; // рецептурный → активирует бланк 107-1/у
  route: 'topical' | 'systemic' | 'local_anesthetic';
}

export const DRUGS: DrugEntry[] = [
  { name: 'Кальципотриол + Бетаметазон (50 мкг + 0.5 мг/г)', inn: 'calcipotriol+betamethasone', groups: ['ТГКС', 'аналоги витамина D'], route: 'topical', rx: true },
  { name: 'Мометазона фуроат 0.1%', inn: 'mometasone', groups: ['ТГКС'], route: 'topical' },
  { name: 'Метилпреднизолона ацепонат 0.1%', inn: 'methylprednisolone aceponate', groups: ['ТГКС'], route: 'topical' },
  { name: 'Клобетазола пропионат 0.05%', inn: 'clobetasol', groups: ['ТГКС'], route: 'topical', rx: true },
  { name: 'Такролимус 0.1%', inn: 'tacrolimus', groups: ['ингибиторы кальциневрина'], route: 'topical', rx: true },
  { name: 'Пимекролимус 1%', inn: 'pimecrolimus', groups: ['ингибиторы кальциневрина'], route: 'topical' },
  { name: 'Адапален 0.1%', inn: 'adapalene', groups: ['ретиноиды'], teratogenic: true, route: 'topical' },
  { name: 'Адапален 0.1% + Бензоила пероксид 2.5%', inn: 'adapalene+benzoyl peroxide', groups: ['ретиноиды'], teratogenic: true, route: 'topical' },
  { name: 'Третиноин 0.05%', inn: 'tretinoin', groups: ['ретиноиды'], teratogenic: true, route: 'topical', rx: true },
  { name: 'Азелаиновая кислота 15%', inn: 'azelaic acid', groups: ['дикарбоновые кислоты'], route: 'topical' },
  { name: 'Ивермектин 1%', inn: 'ivermectin', groups: ['противопаразитарные'], route: 'topical' },
  { name: 'Метронидазол 0.75%', inn: 'metronidazole', groups: ['нитроимидазолы'], route: 'topical' },
  { name: 'Клиндамицин 1%', inn: 'clindamycin', groups: ['линкозамиды', 'антибиотики'], route: 'topical' },
  { name: 'Мупироцин 2%', inn: 'mupirocin', groups: ['антибиотики'], route: 'topical' },
  { name: 'Тербинафин 1%', inn: 'terbinafine', groups: ['аллиламины', 'антимикотики'], route: 'topical' },
  { name: 'Циклопирокс 8% (лак)', inn: 'ciclopirox', groups: ['антимикотики'], route: 'topical' },
  { name: 'Перметрин 5%', inn: 'permethrin', groups: ['акарициды'], route: 'topical' },
  { name: 'Миноксидил 5%', inn: 'minoxidil', groups: ['вазодилататоры'], route: 'topical' },
  { name: 'Изотретиноин', inn: 'isotretinoin', groups: ['ретиноиды', 'системные ретиноиды'], teratogenic: true, route: 'systemic', rx: true },
  { name: 'Ацитретин', inn: 'acitretin', groups: ['ретиноиды', 'системные ретиноиды'], teratogenic: true, route: 'systemic', rx: true },
  { name: 'Метотрексат', inn: 'methotrexate', groups: ['цитостатики'], teratogenic: true, route: 'systemic', rx: true },
  { name: 'Доксициклин', inn: 'doxycycline', groups: ['тетрациклины', 'антибиотики'], teratogenic: true, route: 'systemic', rx: true },
  { name: 'Миноциклин', inn: 'minocycline', groups: ['тетрациклины', 'антибиотики'], teratogenic: true, route: 'systemic', rx: true },
  { name: 'Амоксициллин', inn: 'amoxicillin', groups: ['пенициллины', 'антибиотики'], route: 'systemic', rx: true },
  { name: 'Амоксициллин + Клавулановая кислота', inn: 'amoxicillin+clavulanate', groups: ['пенициллины', 'антибиотики'], route: 'systemic', rx: true },
  { name: 'Тербинафин 250 мг', inn: 'terbinafine', groups: ['аллиламины', 'антимикотики'], route: 'systemic', rx: true },
  { name: 'Итраконазол 100 мг', inn: 'itraconazole', groups: ['азолы', 'антимикотики'], teratogenic: true, route: 'systemic', rx: true },
  { name: 'Валацикловир 500 мг', inn: 'valacyclovir', groups: ['противовирусные'], route: 'systemic', rx: true },
  { name: 'Цетиризин 10 мг', inn: 'cetirizine', groups: ['антигистаминные'], route: 'systemic' },
  { name: 'Биластин 20 мг', inn: 'bilastine', groups: ['антигистаминные'], route: 'systemic' },
  { name: 'Дупилумаб 300 мг', inn: 'dupilumab', groups: ['ГИБП'], route: 'systemic', rx: true },
  { name: 'Лидокаин 2%', inn: 'lidocaine', groups: ['местные анестетики', 'амидные анестетики', 'лидокаин'], route: 'local_anesthetic' },
  { name: 'Артикаин 4%', inn: 'articaine', groups: ['местные анестетики', 'амидные анестетики'], route: 'local_anesthetic' },
];

export const findDrug = (name: string) => {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return DRUGS.find((d) => d.name.toLowerCase() === n) ?? DRUGS.find((d) => n.startsWith(d.name.toLowerCase().split(' ')[0]));
};

export function searchDrugs(query: string, route?: DrugEntry['route'], limit = 8) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return DRUGS.filter((d) => (!route || d.route === route) && (d.name.toLowerCase().includes(q) || d.inn.includes(q))).slice(0, limit);
}
