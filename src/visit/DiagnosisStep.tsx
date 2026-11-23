import { useState } from 'react';
import { updateSoap, useEnc } from '../state';
import { IcdSearch, SEVERITIES, STAGES } from '../components/center/SectionA';
import { Icon } from '../components/ui/Icon';
import type { Severity, Stage } from '../types';
import { Card, Label, Seg, TextField } from './ui';
import { LabsCard, useProtocol } from './LabsCard';

/** Шаг 3. Диагноз по МКБ-10; рядом обследования и анализы по стандарту МЗ РУз. */
export function DiagnosisStep({ onCalc }: { onCalc: () => void }) {
  const protocol = useProtocol();
  const A = useEnc((s) => s.soap.assessment);
  const d = A.primaryDiagnosis;
  const calcs = Object.entries(A.calculators);
  const [addSecondary, setAddSecondary] = useState(false);
  return (
    <div className="v-grid v-grid--half">
      <Card title="Диагноз">
        <div className="v-field">
          <Label>Основной диагноз (МКБ-10)</Label>
          {d.icd10Code ? (
            <div className="v-dx">
              <Icon name="search" size={18} />
              <span className="mono">{d.icd10Code}</span>
              <strong>{d.icd10Name}</strong>
              <button type="button" className="v-icon" aria-label="Сменить диагноз" onClick={() => updateSoap((s) => { s.assessment.primaryDiagnosis.icd10Code = ''; s.assessment.primaryDiagnosis.icd10Name = ''; })}><Icon name="x" size={16} /></button>
            </div>
          ) : (
            <div className="v-combo"><IcdSearch placeholder="Код или название: L40, псориаз…" onPick={(e) => updateSoap((s) => { s.assessment.primaryDiagnosis.icd10Code = e.code; s.assessment.primaryDiagnosis.icd10Name = e.name; })} /></div>
          )}
        </div>
        <div className="v-field">
          <Label>Клиническая форма</Label>
          <input className="v-input" value={d.clinicalForm} onChange={(e) => updateSoap((s) => { s.assessment.primaryDiagnosis.clinicalForm = e.target.value; })} placeholder="Например: вульгарный бляшечный псориаз" />
        </div>
        <div className="v-field"><Label>Стадия</Label><Seg<Stage> value={d.stage} options={STAGES} onChange={(v) => updateSoap((s) => { s.assessment.primaryDiagnosis.stage = v; })} /></div>
        <div className="v-field"><Label>Степень тяжести</Label><Seg<Severity> value={d.severity} options={SEVERITIES} onChange={(v) => updateSoap((s) => { s.assessment.primaryDiagnosis.severity = v; })} /></div>
        <div className="v-field">
          <Label>Индексы</Label>
          <div className="v-pills">
            {calcs.map(([k, v]) => (
              <span key={k} className="v-index">
                <strong className="mono">{k} {v?.score}</strong> {v?.label}{v?.bsaPercent != null ? ` · BSA ${v.bsaPercent}%` : ''}
                <button type="button" className="v-icon v-icon--sm" aria-label={`Удалить ${k}`} onClick={() => updateSoap((s) => { delete s.assessment.calculators[k as keyof typeof s.assessment.calculators]; })}><Icon name="x" size={14} /></button>
              </span>
            ))}
            <button type="button" className="v-link" onClick={onCalc}>+ индекс</button>
          </div>
        </div>
        <hr className="v-hr" />
        <div className="v-field">
          <Label>Сопутствующие заболевания и осложнения</Label>
          {A.secondaryDiagnoses.map((sd, i) => (
            <div key={sd.icd10Code + i} className="v-dx v-dx--soft">
              <span className="mono">{sd.icd10Code}</span>
              <span>{sd.icd10Name}</span>
              <button type="button" className="v-icon" aria-label="Удалить" onClick={() => updateSoap((s) => { s.assessment.secondaryDiagnoses.splice(i, 1); })}><Icon name="x" size={16} /></button>
            </div>
          ))}
          {addSecondary ? (
            <div className="v-combo"><IcdSearch placeholder="Сопутствующий диагноз…" onPick={(e) => { updateSoap((s) => { s.assessment.secondaryDiagnoses.push({ icd10Code: e.code, icd10Name: e.name, clinicalForm: '', stage: '', severity: '' }); }); setAddSecondary(false); }} /></div>
          ) : (
            <button type="button" className="v-link" onClick={() => setAddSecondary(true)}><Icon name="plus" size={16} /> Добавить сопутствующий диагноз</button>
          )}
        </div>
        <TextField label="Дифференциальный диагноз" hint={A.showDiffInPdf ? 'попадёт в выписку' : 'только во внутренней карте'} value={A.differentialDiagnosis} onChange={(v) => updateSoap((s) => { s.assessment.differentialDiagnosis = v; })} placeholder="С чем дифференцировали…" />
        <label className="v-check"><input type="checkbox" checked={A.showDiffInPdf} onChange={(e) => updateSoap((s) => { s.assessment.showDiffInPdf = e.target.checked; })} /> показывать в выписке</label>
      </Card>
      <LabsCard protocol={protocol} />
    </div>
  );
}
