// Доменные типы DermEMR. Поля soap повторяют JSON-схему soap_data из SPEC §2.2 (в camelCase).

export type Theme = 'light' | 'dark';
export type TimeSlot = 'MORNING' | 'DAY' | 'EVENING';
export type Projection = 'FRONT' | 'BACK' | 'HEAD_FACE' | 'HANDS_FEET';
export type LesionType = 'NEVUS' | 'PLAQUE' | 'PAPULE' | 'VESICLE' | 'NEOPLASM_REMOVAL';
export type EncounterStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED';
export type Course = 'ACUTE' | 'SUBACUTE' | 'CHRONIC';
export type Distribution = 'LIMITED' | 'DISSEMINATED' | 'UNIVERSAL';
export type Symmetry = 'SYMMETRIC' | 'ASYMMETRIC';
export type Stage = 'PROGRESSIVE' | 'STATIONARY' | 'REGRESSIVE';
export type Severity = 'MILD' | 'MODERATE' | 'SEVERE';
export type CalcKey = 'PASI' | 'SCORAD' | 'EASI' | 'GAGS' | 'DLQI' | 'UAS7';
export type BillingCategory = 'RENDERED' | 'PRESCRIBED';
export type CartStatus = 'DRAFT' | 'SENT_TO_CASHIER' | 'UPDATED_AFTER_SEND' | 'PAID';
export type PayerType = 'CASH' | 'DMS' | 'CORPORATE';
export type Channel = 'PATIENT_PORTAL' | 'TELEGRAM' | 'WHATSAPP' | 'MAX';
export type DeliveryStatus = 'IDLE' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type SaveState = 'saved' | 'pending' | 'saving' | 'offline' | 'conflict';

export interface Patient {
  id: string;
  telegramChatId?: string | null;
  maxUserId?: string | null;
  fullName: string;
  sex: 'F' | 'M';
  birthDate: string; // ISO
  cardNumber: string;
  fitzpatrick: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  weightKg: number;
  allergies: string[];
  isPregnantOrLactating: boolean;
  activeRetinoids: boolean;
  communicationConsent: boolean;
  phone: string;
  telegramLinked: boolean;
}

export interface Marker {
  id: string;
  number: number;
  projection: Projection;
  x: number; // 0..1000, нормализовано к viewBox
  y: number;
  anatomyCode: string;
  anatomyLabel: string;
  lesionType: LesionType;
  description: string; // морфология конкретного очага
}

export interface DermatoscopyFinding {
  network: '' | 'типичная' | 'атипичная' | 'негативная' | 'отсутствует';
  dotsGlobules: '' | 'регулярные' | 'нерегулярные' | 'отсутствуют';
  streaks: boolean;
  vessels: string[];
  blueWhiteVeil: boolean;
  miliaCysts: boolean;
  comedoOpenings: boolean;
}

export interface Diagnosis {
  icd10Code: string;
  icd10Name: string;
  clinicalForm: string;
  stage: Stage | '';
  severity: Severity | '';
}

export interface TopicalItem {
  id: string;
  form: string;
  drugName: string;
  applicationZone: string;
  frequency: string;
  timeOfDaySlot: TimeSlot[];
  method: string;
  durationDays: number;
  taperingScheme: string;
}

export interface SystemicItem {
  id: string;
  drugName: string;
  dose: string;
  regimen: string;
  mealRelation: string;
  timeOfDaySlot: TimeSlot[];
  durationDays: number;
  dailyDoseMg?: number; // для калькулятора кумулятивной дозы
}

export interface SkincareItem {
  id: string;
  step: string;
  productRecommendation: string;
  timeOfDaySlot: TimeSlot[];
}

export interface ExtemporalRx {
  id: string;
  templateKey: string;
  title: string;
  form: string; // лекарственная форма (M.f. …)
  composition: { ingredient: string; amount: string }[];
  sig: string;
  applicationZone: string;
  timeOfDaySlot: TimeSlot[];
  durationDays: number;
}

export interface ProcedureItem {
  id: string;
  serviceCode: string;
  name: string;
  category: BillingCategory;
  quantity: number;
  unitPrice: number;
  source: 'AUTO_FROM_SOAP' | 'MANUAL';
}

export interface CalcResult {
  score: number;
  label: string;
  bsaPercent?: number;
}

export interface Soap {
  subjective: {
    complaintTags: string[];
    itchVasScore: number;
    sleepDisturbance: boolean;
    anamnesisMorbi: string;
    anamnesisVitae: string;
    previousTherapySummary: string;
  };
  objective: {
    processCourse: Course | '';
    distribution: Distribution | '';
    symmetry: Symmetry | '';
    primaryElements: string[];
    secondaryElements: string[];
    localizationText: string;
    bordersDescription: string;
    statusLocalis: string;
    dermatoscopy: Record<string, DermatoscopyFinding>; // по id маркера
    dermatoscopyNotes: string;
    appendagesStatus: string;
  };
  assessment: {
    primaryDiagnosis: Diagnosis;
    secondaryDiagnoses: Diagnosis[];
    calculators: Partial<Record<CalcKey, CalcResult>>;
    differentialDiagnosis: string;
    showDiffInPdf: boolean;
  };
  plan: {
    topicalTherapy: TopicalItem[];
    systemicTherapy: SystemicItem[];
    extemporalPrescriptions: ExtemporalRx[];
    skincareRoutine: SkincareItem[];
    proceduresAndLabs: ProcedureItem[]; // единый источник для корзины (двусторонняя синхронизация)
    followUpDays: number;
    generalRecommendations: string;
    isotretinoinPriorMg: number;
  };
}

export interface DocsSelection {
  summary: boolean;
  attachDermatoscopy: boolean;
  prescriptions: boolean;
  memo: boolean;
  estimate: boolean;
}

export interface HistoryItem {
  date: string;
  kind: 'visit' | 'lab';
  title: string;
  note?: string;
  values?: { name: string; value: number; unit: string; ref: [number, number] }[];
}

export interface PreviousVisit {
  date: string;
  diagnosis: string;
  anamnesisMorbi: string;
  anamnesisVitae: string;
  previousTherapySummary: string;
}

export interface EncounterState {
  encounterId: string;
  appointmentType: 'PRIMARY' | 'FOLLOW_UP' | 'TELEMEDICINE';
  history: HistoryItem[];
  previousVisit: PreviousVisit | null;
  documents: GeneratedDoc[];
  status: EncounterStatus;
  startedAt: number;
  draftVersion: number;
  savedAt: string | null;
  saveState: SaveState;
  patient: Patient;
  soap: Soap;
  markers: Marker[];
  activeProjection: Projection;
  billing: {
    status: CartStatus;
    payerType: PayerType;
    discountPercent: number;
    sentAt: string | null;
  };
  docs: DocsSelection;
  delivery: Record<Channel, DeliveryStatus>;
  completionErrors: string[];
}

export interface GeneratedDoc {
  id: string;
  docType: 'SUMMARY_DESKTOP_A4' | 'SUMMARY_MOBILE' | 'PRESCRIPTION_107' | 'EXTEMPORAL_RX' | 'PATIENT_MEMO' | 'ESTIMATE';
  url: string;
  verificationHash: string;
  generatedAt: string;
}
