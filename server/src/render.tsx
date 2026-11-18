import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { DOC_CSS, DOC_FONTS } from '../../src/components/documents/docStyles';
import {
  EstimateA4, ExtemporalRxA4, MemoA4, PrescriptionsA4, SummaryA4, SummaryMobile,
} from '../../src/components/documents/Documents';
import type { MediaItem } from '../../src/components/left/media';
import type { EncounterState, GeneratedDoc } from '../../src/types';
import { rxDrugs } from '../../src/lib/documents';

export type DocType = GeneratedDoc['docType'];

export const DOC_TITLES: Record<DocType, string> = {
  SUMMARY_DESKTOP_A4: 'Заключение_A4',
  SUMMARY_MOBILE: 'Заключение_Mobile',
  PRESCRIPTION_107: 'Рецепты_107-1у',
  EXTEMPORAL_RX: 'Рецепты_экстемпоральные',
  PATIENT_MEMO: 'Памятка',
  ESTIMATE: 'Смета',
};

/** Какие документы входят в пакет по чек-боксам «Документы на выход» (PRD §4.4.2). */
export function docTypesFor(state: EncounterState): DocType[] {
  const d = state.docs;
  const out: DocType[] = [];
  if (d.summary) out.push('SUMMARY_DESKTOP_A4', 'SUMMARY_MOBILE');
  if (d.prescriptions && rxDrugs(state).length) out.push('PRESCRIPTION_107');
  if (d.prescriptions && state.soap.plan.extemporalPrescriptions.length) out.push('EXTEMPORAL_RX');
  if (d.memo) out.push('PATIENT_MEMO');
  if (d.estimate) out.push('ESTIMATE');
  return out;
}

export function renderDocHtml(type: DocType, state: EncounterState, photos: MediaItem[], verifyBase: string): string {
  const props = { state, verifyBase };
  const el: ReactElement = {
    SUMMARY_DESKTOP_A4: <SummaryA4 {...props} photos={photos} />,
    SUMMARY_MOBILE: <SummaryMobile {...props} />,
    PRESCRIPTION_107: <PrescriptionsA4 {...props} />,
    EXTEMPORAL_RX: <ExtemporalRxA4 {...props} />,
    PATIENT_MEMO: <MemoA4 {...props} />,
    ESTIMATE: <EstimateA4 {...props} />,
  }[type];
  const page = type === 'SUMMARY_MOBILE' ? '@page{margin:0}' : '@page{size:A4;margin:0}';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${DOC_TITLES[type]}</title>` +
    `<link rel="stylesheet" href="${DOC_FONTS}"><style>${DOC_CSS}${page}</style></head><body>${renderToStaticMarkup(el)}</body></html>`;
}
