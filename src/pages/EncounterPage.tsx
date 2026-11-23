import { useEffect, useState } from 'react';
import { flushSave, openEncounter, ui, useEnc, useUi } from '../state';
import { server } from '../lib/api';
import { StickyHeader } from '../components/header/StickyHeader';
import { BodyMap } from '../components/left/BodyMap';
import { BeforeAfter } from '../components/left/BeforeAfter';
import { Calculators } from '../components/left/Calculators';
import { Timeline } from '../components/left/Timeline';
import { SoapSheet } from '../components/center/SoapSheet';
import { BillingCart } from '../components/right/BillingCart';
import { OutputDocs } from '../components/right/OutputDocs';
import { DocumentsModal } from '../components/documents/DocumentsModal';
import { CdssModal, QrModal } from '../components/ui/Overlays';
import { Icon } from '../components/ui/Icon';
import { CalcModal, HistoryDrawer, STEP_TITLES, VisitFooter, VisitStepper, VisitTopbar, useAutoStart } from '../visit/Shell';
import { ComplaintsStep } from '../visit/ComplaintsStep';
import { ExamStep } from '../visit/ExamStep';
import { DiagnosisStep } from '../visit/DiagnosisStep';
import { TreatmentStep } from '../visit/TreatmentStep';
import { SummaryStep } from '../visit/SummaryStep';
import type { EncounterState } from '../types';
import { tr } from '../lib/i18n';

// Карта приёма по страницам (вариант A): Жалобы → Осмотр → Диагноз → Лечение → Итог.
// Режим «Одним листом» сохраняет прежнюю трёхколоночную раскладку.
const filled: ((s: EncounterState) => boolean)[] = [
  (s) => s.soap.subjective.complaintTags.length > 0 || !!s.soap.subjective.anamnesisMorbi.trim(),
  (s) => s.markers.length > 0 || !!s.soap.objective.statusLocalis.trim(),
  (s) => !!s.soap.assessment.primaryDiagnosis.icd10Code,
  (s) => s.soap.plan.topicalTherapy.length + s.soap.plan.systemicTherapy.length + s.soap.plan.extemporalPrescriptions.length > 0,
  (s) => s.status === 'COMPLETED' || s.status === 'SIGNED',
];

const LAYOUT_KEY = 'dermemr-visit-layout';
const readLayout = (): 'steps' | 'sheet' => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'sheet' ? 'sheet' : 'steps';
  } catch {
    return 'steps';
  }
};
const stepKey = (id: string) => `dermemr-step:${id}`;
const readStep = (id: string): number => {
  try {
    const n = Number(sessionStorage.getItem(stepKey(id)));
    return Number.isInteger(n) && n >= 0 && n < STEP_TITLES.length ? n : 0;
  } catch {
    return 0;
  }
};

export function EncounterPage({ id, onDayHospital }: { id: string; onDayHospital?: () => void }) {
  const docsOpen = useUi((s) => s.docsModalOpen);
  const lightbox = useUi((s) => s.lightbox);
  const loading = useUi((s) => s.loading);
  const loadError = useUi((s) => s.loadError);
  const loadedId = useEnc((s) => s.encounterId);
  const state = useEnc((s) => s);
  const [layout, setLayout] = useState(readLayout);
  const [step, setStep] = useState(() => readStep(id));
  const [drawer, setDrawer] = useState(false);
  const [calc, setCalc] = useState(false);
  const ready = !loading && (!server.online || loadedId === id);
  useAutoStart(id, ready);

  useEffect(() => {
    void openEncounter(id);
    setStep(readStep(id));
  }, [id]);

  const goStep = (i: number) => {
    setStep(i);
    try {
      sessionStorage.setItem(stepKey(id), String(i));
    } catch { /* ignore */ }
    document.querySelector('.v-main')?.scrollTo({ top: 0 });
  };
  const switchLayout = () => {
    const next = layout === 'steps' ? 'sheet' : 'steps';
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    // Горячие клавиши SPEC §4.1
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 's' || e.key === 'ы' || e.code === 'KeyS')) {
        e.preventDefault();
        void flushSave();
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        ui.set((u) => { u.docsModalOpen = true; });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) return <div className="page-msg">{tr('Не удалось открыть визит')}: {loadError}. <a href="#/">{tr('К очереди')}</a></div>;
  if (server.online && (loading || loadedId !== id)) return <div className="page-msg mono">{tr('Загрузка карты…')}</div>;

  return (
    <div className={`app${layout === 'steps' ? ' v-app' : ''}`}>
      {layout === 'steps' ? (
        <>
          <VisitTopbar onHistory={() => setDrawer(true)} />
          <VisitStepper active={step} done={filled.map((f) => f(state))} onPick={goStep} />
          <main className="v-main" aria-label={`${tr('Шаг')} ${step + 1}: ${tr(STEP_TITLES[step])}`}>
            {step === 0 && <ComplaintsStep />}
            {step === 1 && <ExamStep onPhotos={() => setDrawer(true)} onCalc={() => setCalc(true)} />}
            {step === 2 && <DiagnosisStep onCalc={() => setCalc(true)} />}
            {step === 3 && <TreatmentStep />}
            {step === 4 && <SummaryStep onDayHospital={onDayHospital} />}
          </main>
          <VisitFooter
            step={step}
            onStep={goStep}
            onFinish={() => ui.set((u) => { u.docsModalOpen = true; })}
            extra={<button type="button" className="v-btn v-btn--soft v-btn--sm" onClick={switchLayout} title={tr('Прежний вид: протокол одним листом в три колонки')}><Icon name="columns" size={16} /> {tr('Одним листом')}</button>}
          />
          <HistoryDrawer open={drawer} onClose={() => setDrawer(false)} />
          <CalcModal open={calc} onClose={() => setCalc(false)} />
        </>
      ) : (
        <>
          <StickyHeader />
          <div className="visitbar">
            <span className="visitbar__title">{tr('Протокол приёма одним листом')}</span>
            <button type="button" className="btn btn--ghost btn--sm visitbar__toggle" onClick={switchLayout} title={tr('Приём по страницам')}>
              <Icon name="steps" /> {tr('По страницам')}
            </button>
          </div>
          <main className={`workspace${lightbox ? ' is-lightbox' : ''}`}>
            <aside className="col col--left" aria-label={tr('Визуализация и калькуляторы')}>
              <BodyMap />
              <BeforeAfter />
              <Calculators />
              <Timeline />
            </aside>
            <section className="col col--center" aria-label={tr('Протокол приема')}>
              <SoapSheet />
            </section>
            <aside className="col col--right" aria-label={tr('Биллинг и документы')}>
              <BillingCart />
              <OutputDocs />
            </aside>
          </main>
        </>
      )}
      {docsOpen && <DocumentsModal />}
      <CdssModal />
      <QrModal />
    </div>
  );
}
