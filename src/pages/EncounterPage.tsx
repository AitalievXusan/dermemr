import { useEffect, useState, type ReactNode } from 'react';
import { cartTotals, flushSave, openEncounter, ui, useEnc, useUi } from '../state';
import { server } from '../lib/api';
import { rub } from '../lib/format';
import { StickyHeader } from '../components/header/StickyHeader';
import { BodyMap } from '../components/left/BodyMap';
import { BeforeAfter } from '../components/left/BeforeAfter';
import { Calculators } from '../components/left/Calculators';
import { Timeline } from '../components/left/Timeline';
import { SoapSheet, SoapToolbar } from '../components/center/SoapSheet';
import { SectionS } from '../components/center/SectionS';
import { SectionO } from '../components/center/SectionO';
import { SectionA } from '../components/center/SectionA';
import { SectionP } from '../components/center/SectionP';
import { GuidelinePanel } from '../components/center/GuidelinePanel';
import { BillingCart } from '../components/right/BillingCart';
import { OutputDocs } from '../components/right/OutputDocs';
import { DocumentsModal } from '../components/documents/DocumentsModal';
import { CdssModal, QrModal } from '../components/ui/Overlays';
import { Icon } from '../components/ui/Icon';
import type { EncounterState } from '../types';

// Приём по страницам: Жалобы → Осмотр → Диагноз → Лечение → Итог.
// Режим «Одним листом» сохраняет прежнюю трёхколоночную раскладку.
type StepKey = 'complaints' | 'exam' | 'diagnosis' | 'treatment' | 'summary';
const STEPS: { key: StepKey; title: string }[] = [
  { key: 'complaints', title: 'Жалобы' },
  { key: 'exam', title: 'Осмотр' },
  { key: 'diagnosis', title: 'Диагноз' },
  { key: 'treatment', title: 'Лечение' },
  { key: 'summary', title: 'Итог' },
];

const filled: Record<StepKey, (s: EncounterState) => boolean> = {
  complaints: (s) => s.soap.subjective.complaintTags.length > 0 || !!s.soap.subjective.anamnesisMorbi.trim(),
  exam: (s) => s.markers.length > 0 || !!s.soap.objective.statusLocalis.trim(),
  diagnosis: (s) => !!s.soap.assessment.primaryDiagnosis.icd10Code,
  treatment: (s) => s.soap.plan.topicalTherapy.length + s.soap.plan.systemicTherapy.length + s.soap.plan.extemporalPrescriptions.length > 0,
  summary: (s) => s.status === 'COMPLETED' || s.status === 'SIGNED',
};

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
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
  } catch {
    return 0;
  }
};

function Stepper({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  const s = useEnc((x) => x);
  return (
    <nav className="steps" aria-label="Шаги приёма">
      {STEPS.map((st, i) => {
        const done = i !== active && filled[st.key](s);
        return (
          <button
            key={st.key}
            type="button"
            className={`steps__item${i === active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
            aria-current={i === active ? 'step' : undefined}
            onClick={() => onPick(i)}
          >
            <span className="steps__head">
              <span className="steps__dot">{done ? <Icon name="check" size={16} /> : i + 1}</span>
              <span className="steps__title">{st.title}</span>
            </span>
            <span className="steps__bar" />
          </button>
        );
      })}
    </nav>
  );
}

const Paper = ({ children }: { children: ReactNode }) => <article className="sheet__paper sheet__paper--step">{children}</article>;

function SummaryStep({ onDayHospital }: { onDayHospital?: () => void }) {
  const s = useEnc((x) => x);
  const dx = s.soap.assessment.primaryDiagnosis;
  const P = s.soap.plan;
  const totals = cartTotals(s);
  const drugs = [...P.systemicTherapy.map((d) => `${d.drugName}${d.dose ? ` ${d.dose}` : ''}${d.regimen ? `, ${d.regimen}` : ''}`), ...P.topicalTherapy.map((d) => `${d.drugName}${d.frequency ? `, ${d.frequency}` : ''}${d.applicationZone ? ` — ${d.applicationZone}` : ''}`), ...P.extemporalPrescriptions.map((r) => r.title)];
  return (
    <div className="stepgrid">
      <div className="stepgrid__main">
        <section className="card">
          <h2 className="card__title">Итог приёма</h2>
          <dl className="summary">
            <dt>Диагноз</dt>
            <dd>{dx.icd10Code ? <><span className="mono">{dx.icd10Code}</span> {dx.icd10Name}{dx.clinicalForm && dx.clinicalForm !== dx.icd10Name ? ` — ${dx.clinicalForm}` : ''}</> : <span className="danger">не указан</span>}</dd>
            <dt>Status localis</dt>
            <dd>{s.soap.objective.statusLocalis || s.soap.objective.localizationText || <span className="muted">не заполнен</span>}</dd>
            <dt>Лечение</dt>
            <dd>{drugs.length ? <ul className="summary__list">{drugs.map((d, i) => <li key={i}>{d}</li>)}</ul> : <span className="muted">назначений нет</span>}</dd>
            <dt>Услуги и анализы</dt>
            <dd>{P.proceduresAndLabs.length ? <ul className="summary__list">{P.proceduresAndLabs.map((p) => <li key={p.id}>{p.name}{p.quantity > 1 ? ` × ${p.quantity}` : ''}</li>)}</ul> : <span className="muted">нет</span>}</dd>
            <dt>Контрольный визит</dt>
            <dd>{P.followUpDays ? `через ${P.followUpDays} дн.` : <span className="muted">не назначен</span>}</dd>
          </dl>
          <div className="summary__total">
            <span>Оказано сегодня</span>
            <strong className="mono">{rub(totals.renderedFinal)}</strong>
            {totals.prescribedFinal > 0 && <span className="muted">· рекомендовано {rub(totals.prescribedFinal)}</span>}
          </div>
        </section>
        {onDayHospital && (
          <section className="card card--accent">
            <div className="card__row">
              <div>
                <h2 className="card__title">Дневной стационар</h2>
                <p className="muted">Курс лечения на 10 дней: данные пациента и диагноз перейдут из этого приёма автоматически.</p>
              </div>
              <button type="button" className="btn btn--accent btn--tall" onClick={onDayHospital}>
                <Icon name="bed" /> Оформить курс
              </button>
            </div>
          </section>
        )}
      </div>
      <aside className="stepgrid__aside">
        <OutputDocs />
        <Timeline />
      </aside>
    </div>
  );
}

function StepContent({ step, onDayHospital }: { step: StepKey; onDayHospital?: () => void }) {
  const lightbox = useUi((s) => s.lightbox);
  switch (step) {
    case 'complaints':
      return (
        <div className="stepgrid">
          <div className="stepgrid__main">
            <SoapToolbar />
            <Paper><SectionS /></Paper>
          </div>
          <aside className="stepgrid__aside"><Timeline /></aside>
        </div>
      );
    case 'exam':
      return (
        <div className={`stepgrid stepgrid--exam${lightbox ? ' is-lightbox' : ''}`}>
          <aside className="stepgrid__aside">
            <BodyMap large />
            <BeforeAfter />
          </aside>
          <div className="stepgrid__main"><Paper><SectionO /></Paper></div>
        </div>
      );
    case 'diagnosis':
      return (
        <div className="stepgrid">
          <div className="stepgrid__main">
            <Paper>
              <SectionA />
              <GuidelinePanel />
            </Paper>
          </div>
          <aside className="stepgrid__aside"><Calculators /></aside>
        </div>
      );
    case 'treatment':
      return (
        <div className="stepgrid">
          <div className="stepgrid__main"><Paper><SectionP /></Paper></div>
          <aside className="stepgrid__aside"><BillingCart /></aside>
        </div>
      );
    default:
      return <SummaryStep onDayHospital={onDayHospital} />;
  }
}

export function EncounterPage({ id, onDayHospital }: { id: string; onDayHospital?: () => void }) {
  const docsOpen = useUi((s) => s.docsModalOpen);
  const lightbox = useUi((s) => s.lightbox);
  const loading = useUi((s) => s.loading);
  const loadError = useUi((s) => s.loadError);
  const loadedId = useEnc((s) => s.encounterId);
  const savedAt = useEnc((s) => s.savedAt);
  const [layout, setLayout] = useState(readLayout);
  const [step, setStep] = useState(() => readStep(id));

  useEffect(() => {
    void openEncounter(id);
    setStep(readStep(id));
  }, [id]);

  const goStep = (i: number) => {
    setStep(i);
    try {
      sessionStorage.setItem(stepKey(id), String(i));
    } catch { /* ignore */ }
    document.querySelector('.stepview')?.scrollTo({ top: 0 });
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

  if (loadError) return <div className="page-msg">Не удалось открыть визит: {loadError}. <a href="#/">К очереди</a></div>;
  if (server.online && (loading || loadedId !== id)) return <div className="page-msg mono">Загрузка карты…</div>;

  const cur = STEPS[step];
  return (
    <div className="app">
      <StickyHeader />
      <div className="visitbar">
        {layout === 'steps' ? <Stepper active={step} onPick={goStep} /> : <span className="visitbar__title">Протокол приёма одним листом</span>}
        <button type="button" className="btn btn--ghost btn--sm visitbar__toggle" onClick={switchLayout} title="Переключить вид карты приёма">
          <Icon name={layout === 'steps' ? 'columns' : 'steps'} /> {layout === 'steps' ? 'Одним листом' : 'По страницам'}
        </button>
      </div>
      {layout === 'sheet' ? (
        <main className={`workspace${lightbox ? ' is-lightbox' : ''}`}>
          <aside className="col col--left" aria-label="Визуализация и калькуляторы">
            <BodyMap />
            <BeforeAfter />
            <Calculators />
            <Timeline />
          </aside>
          <section className="col col--center" aria-label="Протокол приема">
            <SoapSheet />
          </section>
          <aside className="col col--right" aria-label="Биллинг и документы">
            <BillingCart />
            <OutputDocs />
          </aside>
        </main>
      ) : (
        <>
          <main className="stepview" aria-label={`Шаг ${step + 1}: ${cur.title}`}>
            <StepContent step={cur.key} onDayHospital={onDayHospital} />
          </main>
          <footer className="stepnav">
            <span className="stepnav__saved muted">
              <Icon name="check" size={14} /> {savedAt ? 'Черновик сохраняется автоматически' : 'Черновик'}
            </span>
            <span className="stepnav__spacer" />
            {step > 0 && (
              <button type="button" className="btn btn--tall" onClick={() => goStep(step - 1)}>
                <Icon name="arrowLeft" /> {STEPS[step - 1].title}
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn--primary btn--tall" onClick={() => goStep(step + 1)}>
                {STEPS[step + 1].title} <Icon name="arrowRight" />
              </button>
            ) : (
              <button type="button" className="btn btn--accent btn--tall" onClick={() => ui.set((u) => { u.docsModalOpen = true; })}>
                <Icon name="fileText" /> Завершить приём
              </button>
            )}
          </footer>
        </>
      )}
      {docsOpen && <DocumentsModal />}
      <CdssModal />
      <QrModal />
    </div>
  );
}
