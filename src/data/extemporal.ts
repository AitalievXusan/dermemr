import type { TimeSlot } from '../types';

// Конструктор экстемпоральных прописей (PRD §4.3.1 P): готовые прописи болтушек и мазей.
export interface ExtemporalTemplate {
  key: string;
  title: string;
  form: string;
  composition: { ingredient: string; amount: string }[];
  sig: string;
  timeOfDaySlot: TimeSlot[];
  durationDays: number;
}

export const EXTEMPORAL_TEMPLATES: ExtemporalTemplate[] = [
  {
    key: 'zinc_shake',
    title: 'Цинковая взбалтываемая взвесь (болтушка)',
    form: 'M.f. suspensio',
    composition: [
      { ingredient: 'Zinci oxydi', amount: '20,0' },
      { ingredient: 'Talci', amount: '20,0' },
      { ingredient: 'Glycerini', amount: '20,0' },
      { ingredient: 'Aquae purificatae', amount: 'ad 100,0' },
    ],
    sig: 'Перед употреблением взбалтывать. Наносить на очаги 2 раза в день.',
    timeOfDaySlot: ['MORNING', 'EVENING'],
    durationDays: 10,
  },
  {
    key: 'menthol_shake',
    title: 'Противозудная болтушка с ментолом',
    form: 'M.f. suspensio',
    composition: [
      { ingredient: 'Mentholi', amount: '1,0' },
      { ingredient: 'Zinci oxydi', amount: '20,0' },
      { ingredient: 'Talci', amount: '20,0' },
      { ingredient: 'Glycerini', amount: '20,0' },
      { ingredient: 'Aquae purificatae', amount: 'ad 100,0' },
    ],
    sig: 'Перед употреблением взбалтывать. Наносить на зудящие участки до 3 раз в день.',
    timeOfDaySlot: ['MORNING', 'DAY', 'EVENING'],
    durationDays: 14,
  },
  {
    key: 'sulfur_salicylic',
    title: 'Серно-салициловая мазь 5% / 2%',
    form: 'M.f. unguentum',
    composition: [
      { ingredient: 'Sulfuris praecipitati', amount: '2,5' },
      { ingredient: 'Acidi salicylici', amount: '1,0' },
      { ingredient: 'Vaselini', amount: 'ad 50,0' },
    ],
    sig: 'Наносить тонким слоем на очаги 1 раз в день вечером.',
    timeOfDaySlot: ['EVENING'],
    durationDays: 14,
  },
  {
    key: 'tar_ointment',
    title: 'Дегтярная мазь 5%',
    form: 'M.f. unguentum',
    composition: [
      { ingredient: 'Picis liquidae betulinae', amount: '2,5' },
      { ingredient: 'Vaselini', amount: 'ad 50,0' },
    ],
    sig: 'Наносить на бляшки 1 раз в день на ночь. Избегать инсоляции обработанных участков.',
    timeOfDaySlot: ['EVENING'],
    durationDays: 21,
  },
  {
    key: 'salicylic_spirit',
    title: 'Салициловый спирт 2%',
    form: 'M.f. solutio',
    composition: [
      { ingredient: 'Acidi salicylici', amount: '2,0' },
      { ingredient: 'Spiritus aethylici 70%', amount: 'ad 100 ml' },
    ],
    sig: 'Протирать очаги ватным диском 1–2 раза в день, избегая слизистых.',
    timeOfDaySlot: ['MORNING', 'EVENING'],
    durationDays: 14,
  },
  {
    key: 'resorcin_lotion',
    title: 'Примочка с резорцином 1%',
    form: 'M.f. solutio',
    composition: [
      { ingredient: 'Resorcini', amount: '1,0' },
      { ingredient: 'Aquae purificatae', amount: 'ad 100,0' },
    ],
    sig: 'Примочки на очаги мокнутия 3–4 раза в день по 15 минут.',
    timeOfDaySlot: ['MORNING', 'DAY', 'EVENING'],
    durationDays: 5,
  },
];
