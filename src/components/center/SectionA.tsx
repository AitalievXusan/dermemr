import { useState } from 'react';
import { updateSoap, useEnc } from '../../state';
import { searchIcd10, type Icd10Entry } from '../../data/icd10';
import { Checkbox, Segmented } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { SmartText } from '../ui/SmartText';
import type { CalcKey, Severity, Stage } from '../../types';

export const STAGES: { value: Stage; label: string }[] = [
  { value: 'PROGRESSIVE', label: 'Прогрессирующая' }, { value: 'STATIONARY', label: 'Стационарная' }, { value: 'REGRESSIVE', label: 'Регрессирующая' },
];
export const SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'MILD', label: 'Легкая' }, { value: 'MODERATE', label: 'Средняя' }, { value: 'SEVERE', label: 'Тяжелая' },
];

export function IcdSearch({ onPick, placeholder }: { onPick: (e: Icd10Entry) => void; placeholder: string }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const results = searchIcd10(q);
  const pick = (e: Icd10Entry) => { onPick(e); setQ(''); };
  return (
    <div className="combo">
      <span className="combo__icon"><Icon name="search" size={14} /></span>
      <input
        className="input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
          if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
          if (e.key === 'Escape') setQ('');
        }}
        aria-label={placeholder}
      />
      {results.length > 0 && (
        <div className="combo__list" role="listbox">
          {results.map((r, i) => (
            <button key={r.code} type="button" role="option" aria-selected={i === active} className={`combo__item${i === active ? ' is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
              <span className="mono">{r.code}</span> {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SectionA() {
  const A = useEnc((s) => s.soap.assessment);
  const d = A.primaryDiagnosis;
  const calcs = Object.entries(A.calculators) as [CalcKey, { score: number; label: string; bsaPercent?: number }][];

  return (
    <section className="soap__section" id="soap-a">
      <div className="soap__marker">A</div>
      <div className="soap__body">
        <div className="soap__field">
          <span className="soap__label">Основной диагноз (МКБ-10)</span>
          {d.icd10Code ? (
            <div className="dx">
              <span className="dx__code mono">{d.icd10Code}</span>
              <span className="dx__name">{d.icd10Name}</span>
              <button type="button" className="icon-btn" aria-label="Сменить диагноз" onClick={() => updateSoap((s) => { s.assessment.primaryDiagnosis.icd10Code = ''; s.assessment.primaryDiagnosis.icd10Name = ''; })}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ) : (
            <IcdSearch placeholder="Поиск по коду или названию (L40, псориаз…)" onPick={(e) => updateSoap((s) => { s.assessment.primaryDiagnosis.icd10Code = e.code; s.assessment.primaryDiagnosis.icd10Name = e.name; })} />
          )}
        </div>

        <div className="soap__field">
          <span className="soap__label">Клиническая форма</span>
          <SmartText value={d.clinicalForm} onChange={(v) => updateSoap((s) => { s.assessment.primaryDiagnosis.clinicalForm = v; })} placeholder="Например: вульгарный бляшечный псориаз" ariaLabel="Клиническая форма" />
        </div>

        <div className="soap__grid2">
          <div><span className="soap__label">Стадия</span><Segmented size="sm" options={STAGES} value={d.stage as Stage} onChange={(v) => updateSoap((s) => { s.assessment.primaryDiagnosis.stage = v; })} /></div>
          <div><span className="soap__label">Степень тяжести</span><Segmented size="sm" options={SEVERITIES} value={d.severity as Severity} onChange={(v) => updateSoap((s) => { s.assessment.primaryDiagnosis.severity = v; })} /></div>
        </div>

        {calcs.length > 0 && (
          <div className="soap__row">
            <span className="soap__label">Индексы</span>
            <div className="chips">
              {calcs.map(([k, v]) => (
                <span key={k} className="index-chip">
                  <span className="mono">{k} {v.score}{v.bsaPercent != null ? ` · BSA ${v.bsaPercent}%` : ''}</span>
                  <span className="muted">{v.label}</span>
                  <button type="button" className="icon-btn icon-btn--xs" aria-label={`Удалить ${k}`} onClick={() => updateSoap((s) => { delete s.assessment.calculators[k]; })}><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="soap__field">
          <span className="soap__label">Сопутствующие заболевания и осложнения</span>
          {A.secondaryDiagnoses.map((sd, i) => (
            <div key={sd.icd10Code + i} className="dx dx--sm">
              <span className="dx__code mono">{sd.icd10Code}</span>
              <span>{sd.icd10Name}</span>
              <button type="button" className="icon-btn" aria-label="Удалить" onClick={() => updateSoap((s) => { s.assessment.secondaryDiagnoses.splice(i, 1); })}><Icon name="x" size={14} /></button>
            </div>
          ))}
          <IcdSearch placeholder="Добавить сопутствующий диагноз…" onPick={(e) => updateSoap((s) => { s.assessment.secondaryDiagnoses.push({ icd10Code: e.code, icd10Name: e.name, clinicalForm: '', stage: '', severity: '' }); })} />
        </div>

        <div className="soap__field">
          <span className="soap__label soap__label--between">
            Дифференциальный диагноз
            <Checkbox checked={A.showDiffInPdf} onChange={(v) => updateSoap((s) => { s.assessment.showDiffInPdf = v; })}>показывать в выписке</Checkbox>
          </span>
          <SmartText value={A.differentialDiagnosis} onChange={(v) => updateSoap((s) => { s.assessment.differentialDiagnosis = v; })} placeholder="Только для внутренней карты, если не отмечено иное" ariaLabel="Дифференциальный диагноз" />
        </div>
      </div>
    </section>
  );
}
