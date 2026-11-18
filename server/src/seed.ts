import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, ROOT } from './config';
import type { DbShape, EncounterRec, MediaRec } from './db';
import { createEmptySoap, createInitialEncounter, EXTRA_PATIENTS, HISTORY, PREVIOUS_VISIT } from '../../src/data/mockEncounter';
import { builtinDictionaries } from '../../src/data/dictionaries';

const iso = (d: string) => new Date(`${d}T10:00:00+05:00`).toISOString();

/** Первичное наполнение хранилища: демо-пациенты, история, справочники, демо-снимки. */
export function seedDb(): DbShape {
  const demo = createInitialEncounter();
  const now = new Date().toISOString();
  const defaults = { billing: { status: 'DRAFT' as const, payerType: 'CASH' as const, discountPercent: 0, sentAt: null }, docs: demo.docs };

  const pastVisit = (id: string, date: string, pasi: number, therapy: string): EncounterRec => {
    const soap = createEmptySoap();
    soap.subjective.anamnesisMorbi = PREVIOUS_VISIT.anamnesisMorbi;
    soap.subjective.anamnesisVitae = PREVIOUS_VISIT.anamnesisVitae;
    soap.subjective.previousTherapySummary = PREVIOUS_VISIT.previousTherapySummary;
    soap.assessment.primaryDiagnosis = { icd10Code: 'L40.0', icd10Name: 'Псориаз обыкновенный', clinicalForm: 'Вульгарный бляшечный псориаз', stage: 'PROGRESSIVE', severity: 'MODERATE' };
    soap.assessment.calculators = { PASI: { score: pasi, label: pasi > 20 ? 'тяжелая степень' : 'средняя степень' } };
    soap.plan.generalRecommendations = therapy;
    return {
      id, patientId: demo.patient.id, doctorId: 'doc_sokolova', appointmentType: 'FOLLOW_UP', status: 'SIGNED',
      startedAt: Date.parse(iso(date)), completedAt: iso(date), draftVersion: 1, soap, markers: [], ...defaults,
      previousVisit: null, createdAt: iso(date), updatedAt: iso(date),
    };
  };

  const encounters: EncounterRec[] = [
    pastVisit('enc_2026_08_15_0007', '2026-08-15', 22.4, 'Первичный прием. BSA 21%.'),
    pastVisit('enc_2026_10_21_0031', '2026-10-21', 18.2, 'Назначен ацитретин 25 мг.'),
    {
      id: demo.encounterId, patientId: demo.patient.id, doctorId: 'doc_sokolova', appointmentType: 'FOLLOW_UP', status: 'IN_PROGRESS',
      startedAt: Date.now() - 9 * 60 * 1000, completedAt: null, draftVersion: 1, soap: demo.soap, markers: demo.markers,
      billing: demo.billing, docs: demo.docs, previousVisit: null, createdAt: now, updatedAt: now,
    },
    ...EXTRA_PATIENTS.map((p, i): EncounterRec => ({
      id: `enc_2026_11_18_00${43 + i}`, patientId: p.id, doctorId: 'doc_sokolova', appointmentType: 'PRIMARY', status: 'WAITING',
      startedAt: null, completedAt: null, draftVersion: 1, soap: createEmptySoap(), markers: [], ...defaults,
      previousVisit: null, createdAt: now, updatedAt: now,
    })),
  ];
  // первичный прием: базовая услуга в корзине
  encounters.slice(3).forEach((e) => e.soap.plan.proceduresAndLabs.push({
    id: `pr_base_${e.id}`, serviceCode: 'B01.008.001', name: 'Прием врача-дерматовенеролога первичный', category: 'RENDERED', quantity: 1, unitPrice: 3500, source: 'MANUAL',
  }));

  // Демо-снимки (процедурные, помечены «ДЕМО-СНИМОК»)
  const media: MediaRec[] = [];
  const seedDir = resolve(ROOT, 'server', 'seed');
  if (existsSync(seedDir)) {
    const files = readdirSync(seedDir).filter((f) => f.endsWith('.jpg')).sort();
    const plan: [string, string | null, string, MediaRec['mediaType'], boolean][] = [
      ['demo_mk1_before.jpg', 'mk_1', '2026-10-21', 'MACRO_PHOTO', false],
      ['demo_mk1_after.jpg', 'mk_1', '2026-11-18', 'MACRO_PHOTO', true],
      ['demo_mk2_derm.jpg', 'mk_2', '2026-11-18', 'DERMATOSCOPY', true],
    ];
    plan.forEach(([file, markerId, date, type, pdf], i) => {
      if (!files.includes(file)) return;
      const id = `media_seed_${i + 1}`;
      copyFileSync(resolve(seedDir, file), resolve(config.dataDir, 'media', `${id}.jpg`));
      media.push({ id, encounterId: demo.encounterId, patientId: demo.patient.id, markerId, mediaType: type, file: `${id}.jpg`, mime: 'image/jpeg', includeInPdf: pdf, date, createdAt: now, source: 'SEED' });
    });
  }

  return {
    version: 1,
    patients: [demo.patient, ...EXTRA_PATIENTS],
    labs: { [demo.patient.id]: HISTORY.filter((h) => h.kind === 'lab') },
    encounters,
    media,
    carts: [],
    documents: [],
    deliveries: [],
    portal: [],
    linkTokens: [],
    dictionaries: builtinDictionaries() as unknown as Record<string, unknown>,
  };
}
