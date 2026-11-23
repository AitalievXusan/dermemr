import type { EncounterState, HistoryItem, Patient, Soap } from '../types';

// Демо-визит, построенный на примере soap_data из SPEC §2.2.

export const PREVIOUS_VISIT = {
  date: '2026-10-21',
  diagnosis: 'L40.0 Псориаз обыкновенный, прогрессирующая стадия',
  pasi: 18.2,
  anamnesisMorbi:
    'Считает себя больным в течение 3 лет. Обострения в осенне-зимний период. Применял топические ГКС с временным эффектом.',
  anamnesisVitae: 'Наследственность отягощена по псориазу (отец). Хронические заболевания отрицает.',
  previousTherapySummary: 'Топические ГКС короткими курсами.',
};

export const HISTORY: HistoryItem[] = [
  { date: '2026-11-12', kind: 'lab', title: 'Биохимия крови', values: [
    { name: 'АЛТ', value: 52, unit: 'Ед/л', ref: [0, 40] },
    { name: 'АСТ', value: 31, unit: 'Ед/л', ref: [0, 40] },
    { name: 'Триглицериды', value: 2.1, unit: 'ммоль/л', ref: [0, 1.7] },
    { name: 'Холестерин', value: 5.0, unit: 'ммоль/л', ref: [0, 5.2] },
  ] },
  { date: '2026-10-21', kind: 'visit', title: 'Повторный прием · L40.0', note: 'PASI 18.2 · назначен ацитретин 25 мг' },
  { date: '2026-09-02', kind: 'lab', title: 'Соскоб на патогенные грибы', values: [
    { name: 'Мицелий', value: 0, unit: 'не обнаружен', ref: [0, 0] },
  ] },
  { date: '2026-08-15', kind: 'visit', title: 'Первичный прием · L40.0', note: 'PASI 22.4 · BSA 21%' },
];

export function createInitialEncounter(): EncounterState {
  return {
    encounterId: 'enc_2026_11_18_0042',
    appointmentType: 'FOLLOW_UP',
    history: HISTORY,
    previousVisit: PREVIOUS_VISIT,
    documents: [],
    status: 'IN_PROGRESS',
    startedAt: Date.now() - 9 * 60 * 1000 - 14 * 1000,
    draftVersion: 14,
    savedAt: new Date().toISOString(),
    saveState: 'saved',
    patient: {
      id: 'pat_8841',
      fullName: 'Морозова Анна Викторовна',
      sex: 'F',
      birthDate: '1992-07-10',
      cardNumber: 'АК-2026/08841',
      fitzpatrick: 'II',
      weightKg: 68.5,
      allergies: ['Лидокаин', 'Пенициллины'],
      isPregnantOrLactating: false,
      activeRetinoids: true,
      communicationConsent: true,
      phone: '+79161234567',
      telegramLinked: true,
      telegramChatId: null,
      maxUserId: null,
    },
    activeProjection: 'FRONT',
    markers: [
      { id: 'mk_1', number: 1, projection: 'BACK', x: 205, y: 388, anatomyCode: 'BACK_L_ELBOW', anatomyLabel: 'Левый локоть (разгибательная поверхность)', lesionType: 'PLAQUE', description: 'Бляшка 4×3 см, инфильтрированная, серебристое шелушение.' },
      { id: 'mk_2', number: 2, projection: 'FRONT', x: 395, y: 698, anatomyCode: 'FRONT_R_KNEE', anatomyLabel: 'Правое колено', lesionType: 'PLAQUE', description: 'Бляшка 5×4 см с тенденцией к периферическому росту.' },
    ],
    soap: {
      subjective: {
        complaintTags: ['высыпания', 'зуд', 'шелушение'],
        itchVasScore: 7,
        sleepDisturbance: true,
        anamnesisMorbi: 'Считает себя больной в течение 3 лет. Ухудшение последние 3 недели после ОРВИ.',
        anamnesisVitae: 'Наследственность отягощена по псориазу (отец)...',
        previousTherapySummary: 'Топические ГКС с временным эффектом.',
      },
      objective: {
        processCourse: 'CHRONIC',
        distribution: 'DISSEMINATED',
        symmetry: 'SYMMETRIC',
        primaryElements: ['папула', 'бляшка'],
        secondaryElements: ['чешуйка', 'экскориация'],
        localizationText: 'Разгибательная поверхность локтевых и коленных суставов, ВЧГ.',
        bordersDescription: 'Границы четкие, склонность к периферическому росту.',
        statusLocalis: 'Процесс носит распространенный характер. Бляшки розово-красного цвета с серебристо-белым шелушением на поверхности.',
        dermatoscopy: {
          mk_1: { network: 'отсутствует', dotsGlobules: '', streaks: false, vessels: ['точечные'], blueWhiteVeil: false, miliaCysts: false, comedoOpenings: false },
          mk_2: { network: 'отсутствует', dotsGlobules: '', streaks: false, vessels: ['точечные', 'клубочковые'], blueWhiteVeil: false, miliaCysts: false, comedoOpenings: false },
        },
        dermatoscopyNotes: 'Равномерные точечные сосуды на розовом фоне, белые чешуйки.',
        appendagesStatus: 'Ногтевые пластины кистей: симптом наперстка.',
      },
      assessment: {
        primaryDiagnosis: {
          icd10Code: 'L40.0',
          icd10Name: 'Псориаз обыкновенный',
          clinicalForm: 'Вульгарный бляшечный псориаз',
          stage: 'PROGRESSIVE',
          severity: 'MODERATE',
        },
        secondaryDiagnoses: [],
        calculators: {
          PASI: { score: 14.8, label: 'средняя степень', bsaPercent: 18 },
          DLQI: { score: 16, label: 'очень сильное влияние' },
        },
        differentialDiagnosis: 'Себорейный дерматит, красный плоский лишай.',
        showDiffInPdf: false,
      },
      plan: {
        topicalTherapy: [
          {
            id: 'top_1',
            form: 'Мазь',
            drugName: 'Кальципотриол + Бетаметазон (50 мкг + 0.5 мг/г)',
            applicationZone: 'На бляшки туловища и конечностей',
            frequency: '1 раз в сутки вечером',
            timeOfDaySlot: ['EVENING'],
            method: 'Тонким слоем, не втирая',
            durationDays: 28,
            taperingScheme: 'Далее переход на 2 раза в неделю в течение 4 недель',
          },
        ],
        systemicTherapy: [],
        extemporalPrescriptions: [],
        skincareRoutine: [
          { id: 'care_1', step: 'Очищение', productRecommendation: 'Липидовосстанавливающий очищающий крем-гель (синдет)', timeOfDaySlot: ['MORNING', 'EVENING'] },
          { id: 'care_2', step: 'Увлажнение', productRecommendation: 'Эмолент с церамидами и мочевиной 5%', timeOfDaySlot: ['MORNING', 'EVENING'] },
        ],
        proceduresAndLabs: [
          { id: 'pr_0', serviceCode: 'B01.008.002', name: 'Повторная консультация (в течение месяца)', category: 'RENDERED', quantity: 1, unitPrice: 200000, source: 'MANUAL' },
          { id: 'pr_1', serviceCode: 'A03.01.001', name: 'Дерматоскопия образований кожи (1 элемент)', category: 'RENDERED', quantity: 2, unitPrice: 0, source: 'AUTO_FROM_SOAP', priceNote: 'нет в прайсе — впишите цену' },
          { id: 'pr_2', serviceCode: 'DC-093', name: 'АЛТ (аланинаминотрансфераза)', category: 'PRESCRIBED', quantity: 1, unitPrice: 60000, source: 'AUTO_FROM_SOAP' },
          { id: 'pr_3', serviceCode: 'B03.016.003', name: 'Общий анализ крови, 29 параметров + СОЭ', category: 'PRESCRIBED', quantity: 1, unitPrice: 80000, source: 'AUTO_FROM_SOAP' },
          { id: 'pr_4', serviceCode: 'B01.008.002-14', name: 'Контрольный приём дерматовенеролога (через 14 дней)', category: 'PRESCRIBED', quantity: 1, unitPrice: 200000, source: 'AUTO_FROM_SOAP' },
        ],
        followUpDays: 14,
        generalRecommendations: 'Исключить травматизацию кожи (феномен Кебнера), использовать мягкие мочалки.',
        isotretinoinPriorMg: 0,
      },
    },
    billing: { status: 'DRAFT', payerType: 'CASH', discountPercent: 0, sentAt: null },
    docs: { summary: true, attachDermatoscopy: true, prescriptions: true, memo: true, estimate: false },
    delivery: { PATIENT_PORTAL: 'IDLE', TELEGRAM: 'IDLE', WHATSAPP: 'IDLE', MAX: 'IDLE' },
    completionErrors: [],
  };
}

/** Пустой протокол для нового приема. */
export function createEmptySoap(): Soap {
  return {
    subjective: { complaintTags: [], itchVasScore: 0, sleepDisturbance: false, anamnesisMorbi: '', anamnesisVitae: '', previousTherapySummary: '' },
    objective: {
      processCourse: '', distribution: '', symmetry: '', primaryElements: [], secondaryElements: [], localizationText: '',
      bordersDescription: '', statusLocalis: '', dermatoscopy: {}, dermatoscopyNotes: '', appendagesStatus: '',
    },
    assessment: {
      primaryDiagnosis: { icd10Code: '', icd10Name: '', clinicalForm: '', stage: '', severity: '' },
      secondaryDiagnoses: [], calculators: {}, differentialDiagnosis: '', showDiffInPdf: false,
    },
    plan: {
      topicalTherapy: [], systemicTherapy: [], extemporalPrescriptions: [], skincareRoutine: [],
      proceduresAndLabs: [], followUpDays: 14, generalRecommendations: '', isotretinoinPriorMg: 0,
    },
  };
}

/** Дополнительные пациенты очереди для демонстрации (первичные приемы). */
export const EXTRA_PATIENTS: Patient[] = [
  {
    id: 'pat_9102', fullName: 'Ковалев Дмитрий Сергеевич', sex: 'M', birthDate: '1988-03-22', cardNumber: 'АК-2026/09102',
    fitzpatrick: 'III', weightKg: 82, allergies: [], isPregnantOrLactating: false, activeRetinoids: false,
    communicationConsent: true, phone: '+79035550112', telegramLinked: false, telegramChatId: null, maxUserId: null,
  },
  {
    id: 'pat_9177', fullName: 'Юсупова Мадина Рустамовна', sex: 'F', birthDate: '2001-09-05', cardNumber: 'АК-2026/09177',
    fitzpatrick: 'IV', weightKg: 58, allergies: [], isPregnantOrLactating: true, activeRetinoids: false,
    communicationConsent: false, phone: '+998901234567', telegramLinked: false, telegramChatId: null, maxUserId: null,
  },
];
