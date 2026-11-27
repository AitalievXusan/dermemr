// Дневной стационар: курс лечения на 10 рабочих дней (без воскресений), лист назначений с отметками.
// Шаблоны составлены по листам назначений клиники; отметка std — позиция есть в стандарте МЗ РУз.
// Витилиго собирается конструктором по правилам врача: src/data/vitBuilder.ts,
// остальные нозологии — по листам врача и протоколам МЗ: src/data/nosologies.ts.

export type DayLang = 'ru' | 'uz';
export type DaySection = 'drug' | 'top' | 'phys';
export type DayPattern = 'daily' | 'odd' | 'even' | 'home' | 'manual';
/** Нозологии дневного стационара (шаблоны курса). */
export const NOS_KEYS = [
  'vit', 'acne', 'postacne', 'rosacea', 'hidra', 'follic', 'alopecia', 'psor', 'lichen', 'eczema', 'neuro', 'atopic', 'toxi', 'urtic',
  'vasc', 'sle', 'sclero', 'mycosis', 'empty',
] as const;
export type DayTemplate = (typeof NOS_KEYS)[number];
export type NosStage = 'prog' | 'stat' | 'regr';
/** Параметры конструктора для нозологий кроме витилиго: форма, стадия, номер курса, миноксидил, процедуры. */
export interface NosParams {
  form?: string;
  stage?: NosStage;
  course?: 1 | 2 | 3 | 4;
  /** Миноксидил: 5%, 2% или не назначать. */
  minox?: '5' | '2' | '0';
  /** Алопеция: PRP чередуется с мезотерапией Derma Heal HL или только PRP. */
  proc?: 'alt' | 'prp';
}
export const COURSE_DAYS = 10;

export interface DayRow {
  id: string;
  sec: DaySection;
  ru: string;
  uz: string;
  /** '+' — процедура в этот день, '-' — пропуск (через день), число — доза, '' — дома по схеме. */
  cells: string[];
  std: boolean | null;
  pk: DayPattern;
  /** Строка собрана конструктором (по правилам врача). */
  auto?: boolean;
  /** Ключ правила конструктора: dex, tacro, epta… */
  key?: string;
  /** Врач правил строку вручную — при пересборке не трогаем. */
  edited?: boolean;
  /** Почему строка попала в лист (код, переводится в интерфейсе): age, kid, course:2, stat, setton, mz, dex:3:2.5 */
  why?: string;
}

/** Параметры конструктора курса витилиго. */
export interface VitParams {
  stage: 'prog' | 'stat';
  course: 1 | 2 | 3 | 4;
  setton: boolean;
  /** EPTA VTLG ребёнку вернули под ответственность врача. */
  eptaBack: boolean;
}

/** Строка блока «Тавсия / Рекомендации после курса». */
export interface AfterRow {
  id: string;
  ru: string;
  uz: string;
  /** Собрано конструктором; после правки врачом — false (строка врача, при пересборке остаётся). */
  auto?: boolean;
}

export interface DayCourse {
  id: string;
  encounterId: string | null;
  patientId: string | null;
  fio: string;
  birthYear: string;
  phone: string;
  diagnosis: string;
  doctor: string;
  startDate: string; // YYYY-MM-DD
  template: DayTemplate;
  lang: DayLang;
  rows: DayRow[];
  /** Конструктор витилиго: стадия, номер курса, Сеттон. */
  vit?: VitParams;
  /** Конструктор остальных нозологий. */
  nos?: NosParams;
  /** Пол пациента из карты (M/F), для подсказок (миноксидил). */
  sex?: 'M' | 'F' | '';
  /** Анализы: ключи справочника LABS или свой текст с префиксом «c:». */
  labs?: string[];
  /** Рекомендации после курса (печатаются после листа). */
  after?: AfterRow[];
  /** Повторный осмотр через N недель после последнего дня курса; 0 — не назначать. */
  followWeeks?: number;
  status: 'ACTIVE' | 'DONE';
  createdAt: string;
  updatedAt: string;
}

export type DayCourseInput = Partial<Omit<DayCourse, 'id' | 'createdAt' | 'updatedAt'>>;

// ---------- даты курса ----------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => iso(new Date());

/** 10 рабочих дней начиная с даты старта; воскресенья пропускаются. */
export function courseDates(start: string): Date[] {
  const [y, m, d] = start.split('-').map(Number);
  const cur = y && m && d ? new Date(y, m - 1, d) : new Date();
  const out: Date[] = [];
  while (out.length < COURSE_DAYS) {
    if (cur.getDay() !== 0) out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
export const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
export const ddmmyyyy = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
};

/** Номер текущего дня курса (1…10), 0 — ещё не начался, 11 — завершён. */
export function courseDay(start: string, now = new Date()): number {
  const dates = courseDates(start);
  const today = iso(now);
  if (today < iso(dates[0])) return 0;
  if (today > iso(dates[COURSE_DAYS - 1])) return COURSE_DAYS + 1;
  const idx = dates.findIndex((d) => iso(d) >= today);
  return idx + 1;
}

// ---------- схемы ----------
export const PATTERNS: Record<Exclude<DayPattern, 'manual'>, () => string[]> = {
  daily: () => Array(COURSE_DAYS).fill('+'),
  odd: () => Array.from({ length: COURSE_DAYS }, (_, i) => (i % 2 === 0 ? '+' : '-')),
  even: () => Array.from({ length: COURSE_DAYS }, (_, i) => (i % 2 === 0 ? '-' : '+')),
  home: () => Array(COURSE_DAYS).fill(''),
};
export const nextMark = (v: string) => (v === '' ? '+' : v === '+' ? '-' : v === '-' ? '' : '+');
export const days = (list: number[]) => Array.from({ length: COURSE_DAYS }, (_, i) => (list.includes(i + 1) ? '+' : ''));
export const dose = (first: string[]) => [...first, ...Array(COURSE_DAYS - first.length).fill('+')];

/** Изотретиноин: обязательная сноска о беременности и печёночных пробах. */
export const isIsotretinoin = (name: string) => /изона|изотретино|роаккутан|акнекутан|isotretino/i.test(name || '');
export const WARN: Record<DayLang, string> = {
  ru: 'При беременности и её планировании ЗАПРЕЩЕНО! Обязательно печёночные пробы — АЛТ, АСТ.',
  uz: 'Ҳомиладорликда ва уни режалаштиришда ТАҚИҚЛАНАДИ! Жигар синамалари — АЛТ, АСТ мажбурий.',
};

let seq = 0;
export const rowId = () => `dr_${Date.now().toString(36)}_${(seq++).toString(36)}`;
export const emptyRow = (sec: DaySection): DayRow => ({ id: rowId(), sec, ru: '', uz: '', cells: Array(COURSE_DAYS).fill(''), std: null, pk: 'manual' });



// ---------- интерфейс на русском и узбекском (кириллица) ----------
export const DH_TR = {
  ru: {
    section: 'Дневной стационар', title: 'Курс лечения · 10 дней', print: 'Печать листа', patient: 'Пациент',
    linked: 'Данные перенесены из амбулаторного приёма. Изменения можно внести здесь.', openVisit: 'Открыть приём',
    fio: 'Ф. И. О.', year: 'Год рождения', phone: 'Телефон', dx: 'Диагноз', doctor: 'Врач', start: 'Начало курса',
    template: 'Шаблон курса', vit: 'Витилиго · L80', acne: 'Акне · L70.0', empty: 'Пустой', course: '10 дней · без воскресений',
    replaceTpl: 'Заменить назначения шаблоном? Текущие строки будут удалены.',
    noProto: 'Протокола МЗ РУз по акне нет в базе — используется шаблон клиники.',
    colName: 'Назначение', colPat: 'Схема', addRow: 'Добавить строку', namePh: 'Препарат или процедура…', inStd: 'в стандарте МЗ РУз',
    pDaily: 'Ежедневно', pOdd: 'Через день (с 1-го)', pEven: 'Через день (со 2-го)', pHome: 'Дома по схеме', pManual: 'Вручную',
    remove: 'Удалить строку', drug: 'Препараты', top: 'Наружно', phys: 'Физиотерапия',
    legend: '«+» — процедура в этот день · «−» — пропуск (через день) · число — доза · жёлтая клетка — дома по схеме · нажмите на клетку, чтобы изменить',
    saved: 'Сохранено', saving: 'Сохранение…', deleteCourse: 'Удалить курс', confirmDelete: 'Удалить этот курс дневного стационара?',
    done: 'Курс завершён', reopen: 'Вернуть в работу', finish: 'Завершить курс',
    builder: 'Конструктор курса · Витилиго', builderHint: 'лист собирается по правилам врача; любую строку можно поправить',
    stage: 'Стадия', prog: 'Прогрессирующая', stat: 'Ремиссия', courseNo: 'Номер курса', courseSug: 'предложен {n}-й', courseFirst: 'первый курс пациента',
    c1: '1-й', c2: '2-й', c3: '3-й', c4: '4-й и далее', setton: 'Галоневус Сеттона', no: 'Нет', yes: 'Есть',
    age: 'Возраст · из года рождения', ageNone: 'Год рождения не указан', ageAdult: 'Взрослый', ageTeen: 'Подросток', ageKid: 'Ребёнок',
    applied: 'Что подставлено по правилам', rebuild: 'Пересобрать лист', rebuildHint: 'Строки, которые вы правили или добавили вручную, остаются как есть.',
    replaceLegacy: 'Этот курс составлен старым шаблоном. Заменить строки листом конструктора?',
    stdLine: 'В стандарте МЗ РУз {n} из {m} позиций', outLine: '{k} вне стандарта — пометка только на экране, на печати её нет', outStd: 'вне стандарта',
    eptaRemoved: 'EPTA VTLG убран из листа: по протоколу МЗ — только взрослым с 18 лет.', eptaBack: 'Вернуть под ответственность врача',
    after: 'Тавсия · Рекомендации после курса', afterHint: 'печатается после листа; если не помещается — на следующей странице',
    addAfter: 'Добавить рекомендацию', afterPh: 'Препарат, доза, срок…', removeAfter: 'Удалить рекомендацию',
    follow: 'Повторный осмотр', followNone: 'не назначать', followWeeks: 'через {n} нед.',
    whyAge: 'по возрасту', whyKid: 'до 12 лет', whyCourse: '{n}-й курс', whyStat: 'ремиссия', whyProg: 'прогрессирующая стадия', whySetton: 'Сеттон',
    whyMz: 'по протоколу МЗ', whyBack: 'возвращён врачом', whyDex: 'дексаметазон {a} → {b} таб.', whyDexAge: 'доза по возрасту и курсу',
    searchPh: 'Поиск по названию или коду МКБ…', quick: 'Частые нозологии', noMatch: 'Ничего не найдено', isNew: 'новый', pickedIcd: 'подобрано по МКБ',
    links: 'Открыть в новой вкладке', kp: 'Протокол', stdDoc: 'Стандарт МЗ РУз', prev: 'Прежние назначения', pageN: 'стр. {n}', sheetsN: '{n} л.',
    noGuide: 'Протокола МЗ РУз по этой нозологии нет в базе — шаблон клиники, без отметок стандарта.',
    builderNos: 'Конструктор курса · {name}', builderNosHint: 'основа — листы врача; любое название, дозу, схему и дни можно поправить',
    form: 'Форма', regr: 'Регрессирующая', exac: 'Обострение', minox: 'Миноксидил', minoxNo: 'Не назначать', minoxHint: 'Обычно 5% — мужчинам, 2% — женщинам. Решает врач.',
    proc: 'Процедуры в дни 1 · 4 · 7 · 10', procAlt: 'PRP ↔ Derma Heal HL', procPrp: 'Только PRP',
    saveMine: 'Сохранить как мой шаблон', savedMine: 'Шаблон сохранён: следующие курсы «{name}» будут собираться по нему.', resetMine: 'Вернуть исходный шаблон',
    confirmReset: 'Удалить ваш шаблон «{name}» и собрать лист по исходному?', confirmSave: 'Сохранить текущий лист как ваш шаблон «{name}»? Новые курсы будут собираться по нему.',
    labs: 'Анализы', labsHint: 'отмеченные печатаются вместе с рекомендациями', addLab: 'Свой анализ', labPh: 'Название анализа…', removeLab: 'Убрать анализ',
    prevTitle: 'Прежние назначения · {name}', prevNote: 'Листы врача без ФИО и телефона: только инициалы, пол и возраст. Лист не меняется — «→ в курс» добавляет строку в текущий курс.',
    toCourse: '→ в курс', added: 'Строка добавлена в курс', sexM: 'муж.', sexF: 'жен.', all: 'Все', noSheets: 'Прежних листов по этой нозологии нет.', close: 'Закрыть',
    sheetSearch: 'Поиск по препарату…', sheetCount: 'Листов: {n}', courseN: '{n}-й курс', sheetPick: 'Выберите лист слева', loading: 'Загрузка…',
  },
  uz: {
    section: 'Кундузги стационар', title: 'Даволаш курси · 10 кун', print: 'Варақани чоп этиш', patient: 'Бемор',
    linked: 'Маълумотлар амбулатор қабулдан ўтказилди. Ўзгартиришни шу ерда киритиш мумкин.', openVisit: 'Қабулни очиш',
    fio: 'Ф. И. Ш.', year: 'Туғилган йили', phone: 'Телефон', dx: 'Ташхис', doctor: 'Шифокор', start: 'Курс бошланиши',
    template: 'Курс андозаси', vit: 'Витилиго · L80', acne: 'Акне · L70.0', empty: 'Бўш', course: '10 кун · якшанбасиз',
    replaceTpl: 'Тайинловлар андоза билан алмаштирилсинми? Жорий қаторлар ўчирилади.',
    noProto: 'ЎзР ССВ акне бўйича протоколи базада йўқ — клиника андозаси ишлатилмоқда.',
    colName: 'Тайинланган муолажа', colPat: 'Схема', addRow: 'Қатор қўшиш', namePh: 'Дори ёки муолажа…', inStd: 'ЎзР ССВ стандартида',
    pDaily: 'Ҳар куни', pOdd: 'Кун ора (1-кундан)', pEven: 'Кун ора (2-кундан)', pHome: 'Уйда схема бўйича', pManual: 'Қўлда',
    remove: 'Қаторни ўчириш', drug: 'Дори воситалари', top: 'Ташқи', phys: 'Физиотерапия',
    legend: '«+» — шу куни муолажа · «−» — ўтказиб юборилади (кун ора) · сон — доза · сариқ катак — уйда схема бўйича · ўзгартириш учун катакни босинг',
    saved: 'Сақланди', saving: 'Сақланмоқда…', deleteCourse: 'Курсни ўчириш', confirmDelete: 'Ушбу кундузги стационар курси ўчирилсинми?',
    done: 'Курс якунланди', reopen: 'Қайта очиш', finish: 'Курсни якунлаш',
    builder: 'Курс конструктори · Витилиго', builderHint: 'варақа шифокор қоидалари бўйича тузилади; исталган қаторни ўзгартириш мумкин',
    stage: 'Босқич', prog: 'Прогрессив', stat: 'Ремиссия', courseNo: 'Курс рақами', courseSug: 'таклиф: {n}-курс', courseFirst: 'беморнинг биринчи курси',
    c1: '1-курс', c2: '2-курс', c3: '3-курс', c4: '4-курс ва кейин', setton: 'Сеттон галоневуси', no: 'Йўқ', yes: 'Бор',
    age: 'Ёши · туғилган йилидан', ageNone: 'Туғилган йили кўрсатилмаган', ageAdult: 'Катта ёшли', ageTeen: 'Ўсмир', ageKid: 'Бола',
    applied: 'Қоидалар бўйича қўйилди', rebuild: 'Варақани қайта тузиш', rebuildHint: 'Қўлда ўзгартирилган ёки қўшилган қаторлар ўз ҳолича қолади.',
    replaceLegacy: 'Бу курс эски андоза билан тузилган. Қаторлар конструктор варақаси билан алмаштирилсинми?',
    stdLine: 'ЎзР ССВ стандартида {m} тадан {n} таси', outLine: '{k} таси стандартдан ташқари — белги фақат экранда, чоп этилганда йўқ', outStd: 'стандартдан ташқари',
    eptaRemoved: 'EPTA VTLG варақадан олиб ташланди: ССВ протоколи бўйича — фақат 18 ёшдан катталарга.', eptaBack: 'Шифокор масъулияти остида қайтариш',
    after: 'Тавсия · Курсдан кейинги тавсиялар', afterHint: 'варақадан кейин чоп этилади; сиғмаса — кейинги саҳифада',
    addAfter: 'Тавсия қўшиш', afterPh: 'Дори, доза, муддат…', removeAfter: 'Тавсияни ўчириш',
    follow: 'Қайта кўрик', followNone: 'тайинланмасин', followWeeks: '{n} ҳафтадан кейин',
    whyAge: 'ёшга кўра', whyKid: '12 ёшгача', whyCourse: '{n}-курс', whyStat: 'ремиссия', whyProg: 'прогрессив босқич', whySetton: 'Сеттон',
    whyMz: 'ССВ протоколи бўйича', whyBack: 'шифокор қайтарди', whyDex: 'дексаметазон {a} → {b} таб.', whyDexAge: 'доза ёш ва курсга кўра',
    searchPh: 'Номи ёки ХКТ коди бўйича излаш…', quick: 'Кўп учрайдиган нозологиялар', noMatch: 'Ҳеч нарса топилмади', isNew: 'янги', pickedIcd: 'ХКТ бўйича танланди',
    links: 'Янги ойнада очиш', kp: 'Протокол', stdDoc: 'ЎзР ССВ стандарти', prev: 'Олдинги тайинловлар', pageN: '{n}-бет', sheetsN: '{n} в.',
    noGuide: 'Бу нозология бўйича ЎзР ССВ протоколи базада йўқ — клиника андозаси, стандарт белгиларисиз.',
    builderNos: 'Курс конструктори · {name}', builderNosHint: 'асос — шифокор варақалари; исталган ном, доза, схема ва кунларни ўзгартириш мумкин',
    form: 'Шакли', regr: 'Регрессив', exac: 'Зўрайиш', minox: 'Миноксидил', minoxNo: 'Тайинламаслик', minoxHint: 'Одатда 5% — эркакларга, 2% — аёлларга. Шифокор ҳал қилади.',
    proc: '1 · 4 · 7 · 10 кунлардаги муолажалар', procAlt: 'PRP ↔ Derma Heal HL', procPrp: 'Фақат PRP',
    saveMine: 'Менинг андозам сифатида сақлаш', savedMine: 'Андоза сақланди: кейинги «{name}» курслари шу бўйича тузилади.', resetMine: 'Асл андозага қайтариш',
    confirmReset: '«{name}» андозангиз ўчирилиб, варақа асл андоза бўйича тузилсинми?', confirmSave: 'Жорий варақа «{name}» андозангиз сифатида сақлансинми? Янги курслар шу бўйича тузилади.',
    labs: 'Таҳлиллар', labsHint: 'белгиланганлари тавсиялар билан бирга чоп этилади', addLab: 'Ўз таҳлилингиз', labPh: 'Таҳлил номи…', removeLab: 'Таҳлилни олиб ташлаш',
    prevTitle: 'Олдинги тайинловлар · {name}', prevNote: 'Шифокор варақалари Ф. И. Ш. ва телефонсиз: фақат исм-шариф бош ҳарфлари, жинси ва ёши. Варақа ўзгармайди — «→ курсга» жорий курсга қатор қўшади.',
    toCourse: '→ курсга', added: 'Қатор курсга қўшилди', sexM: 'эркак', sexF: 'аёл', all: 'Барчаси', noSheets: 'Бу нозология бўйича олдинги варақалар йўқ.', close: 'Ёпиш',
    sheetSearch: 'Дори бўйича излаш…', sheetCount: 'Варақалар: {n}', courseN: '{n}-курс', sheetPick: 'Чапдан варақани танланг', loading: 'Юкланмоқда…',
  },
} as const;

/** Лист назначений для печати. */
export const PRINT_TR = {
  ru: {
    title: 'Лист назначений', doc: 'Врач', dx: 'Диагноз', pt: 'Пациент', yr: 'Год рождения', ph: 'Телефон', num: '№', name: 'Назначение',
    phys: 'Физиотерапия:', sign1: 'Врач', sign2: 'Медсестра',
    after: 'Тавсия · Рекомендации после курса', follow: 'Повторный осмотр', followWeeks: 'через {n} нед.', cont: 'продолжение',
    labs: 'Анализы', courseN: '{n}-й курс',
    legend: 'в/м — внутримышечно; в/в — внутривенно; МЕ — международные единицы. «+» — процедура, «−» — пропуск (через день).',
    clinic: 'Dermaclinic — центр дерматологии и эстетики · г. Ташкент, ул. Буюк Ипак Юли, 187',
  },
  uz: {
    title: 'Муолажалар варақаси', doc: 'Шифокор', dx: 'Ташхис', pt: 'Бемор', yr: 'Туғилган йили', ph: 'Телефон', num: '№', name: 'Тайинланган муолажа',
    phys: 'Физиотерапия:', sign1: 'Шифокор', sign2: 'Ҳамшира',
    after: 'Тавсия · Курсдан кейинги тавсиялар', follow: 'Қайта кўрик', followWeeks: '{n} ҳафтадан кейин', cont: 'давоми',
    labs: 'Таҳлиллар', courseN: '{n}-курс',
    legend: 'м/о — мушак орасига; в/и — вена ичига; ХБ — халқаро бирлик. «+» — муолажа, «−» — ўтказиб юборилади (кун ора).',
    clinic: 'Dermaclinic — дерматология ва эстетика маркази · Тошкент ш., Буюк Ипак Йўли кўчаси, 187',
  },
} as const;
