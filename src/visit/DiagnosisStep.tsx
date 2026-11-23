import { useMemo, useState } from 'react';
import { updateSoap, useEnc } from '../state';
import { IcdSearch, SEVERITIES, STAGES } from '../components/center/SectionA';
import { addProcedure, addToPlan } from '../components/center/GuidelinePanel';
import { drugInGuideline, drugKey, matchGuidelines, pdfUrl, useGuidelines, type Guideline, type GuidelineGroup } from '../lib/guidelines';
import { Icon } from '../components/ui/Icon';
import type { Severity, Stage } from '../types';
import { Card, Label, Pill, Seg, TextField } from './ui';

type Tab = GuidelineGroup | 'diag';
const TABS: { key: Tab; label: string }[] = [
  { key: 'topical', label: 'Наружная' },
  { key: 'systemic', label: 'Системная' },
  { key: 'procedure', label: 'Процедуры' },
  { key: 'diag', label: 'Обследования' },
];

function ProtocolBody({ g }: { g: Guideline }) {
  const topical = useEnc((s) => s.soap.plan.topicalTherapy);
  const systemic = useEnc((s) => s.soap.plan.systemicTherapy);
  const recs = useEnc((s) => s.soap.plan.generalRecommendations);
  const counts = useMemo(() => ({
    topical: g.drugs.filter((d) => d.g === 'topical').length,
    systemic: g.drugs.filter((d) => d.g === 'systemic').length,
    procedure: g.drugs.filter((d) => d.g === 'procedure').length,
    diag: g.diag.length,
  }), [g]);
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => counts[t.key] > 0)?.key ?? 'topical');
  const [q, setQ] = useState('');
  const [mainOnly, setMainOnly] = useState(false);
  const query = q.trim().toLowerCase();
  const planned = [...topical, ...systemic].map((x) => x.drugName).filter(Boolean).flatMap((n) => n.split('+')).map((n) => drugKey(n).replace(/ё/g, 'е'));
  const inPlan = (n: string) => {
    const name = n.toLowerCase().replace(/ё/g, 'е');
    return planned.some((k) => k.length >= 4 && name.includes(k));
  };
  const drugs = tab === 'diag' ? [] : g.drugs.filter((d) => d.g === tab && (!mainOnly || d.s === 'm') && (!query || d.n.toLowerCase().includes(query) || d.d.toLowerCase().includes(query)));
  const diag = tab === 'diag' ? g.diag.filter((d) => !query || d.n.toLowerCase().includes(query) || d.c.toLowerCase().includes(query)) : [];

  return (
    <>
      <div className="v-row v-row--wrap">
        {g.kp && <a className="v-btn v-btn--line" href={pdfUrl(g.kp.file, g.kp.page)} target="_blank" rel="noreferrer"><Icon name="fileText" size={18} /> Протокол, стр. {g.kp.page}</a>}
        <a className="v-btn v-btn--line" href={pdfUrl(g.std.file, g.std.page)} target="_blank" rel="noreferrer"><Icon name="fileText" size={18} /> {g.kp ? 'Стандарт' : 'СОП'}</a>
        {g.extra.map((x) => <a key={x.file} className="v-btn v-btn--line" href={pdfUrl(x.file)} target="_blank" rel="noreferrer"><Icon name="link" size={18} /> {x.title}</a>)}
      </div>
      {g.note && <p className="v-note v-note--warn">{g.note}</p>}
      <div className="v-pills">
        {TABS.map((t) => counts[t.key] > 0 && <Pill key={t.key} on={tab === t.key} onClick={() => setTab(t.key)}>{t.label} · {counts[t.key]}</Pill>)}
      </div>
      <div className="v-row">
        <label className="v-search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти в протоколе…" aria-label="Поиск по протоколу" />
        </label>
        {tab !== 'diag' && g.drugs.some((d) => d.s === 'a') && (
          <label className="v-check"><input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} /> только основные</label>
        )}
      </div>
      <ul className="v-proto">
        {tab === 'diag'
          ? diag.map((d, i) => (
            <li key={i} className="v-proto__row">
              <div><strong>{d.n}</strong>{d.c && <span className="v-muted">{d.c}</span>}</div>
              {d.sp && <span className="v-tag v-tag--neutral">спец. уровень</span>}
            </li>
          ))
          : drugs.map((d, i) => {
            const done = d.g === 'procedure' ? recs.toLowerCase().includes(d.n.toLowerCase()) : inPlan(d.n);
            return (
              <li key={`${d.n}-${i}`} className="v-proto__row">
                <div>
                  <strong>{d.n}</strong>
                  {d.s === 'a' && <span className="v-tag v-tag--neutral">доп.</span>}
                  {d.sp && <span className="v-tag v-tag--neutral">спец. уровень</span>}
                  {d.bad ? (
                    <span className="v-muted">Дозировка в PDF не распознана — <a href={pdfUrl(g.std.file, d.p)} target="_blank" rel="noreferrer">стандарт, стр. {d.p}</a></span>
                  ) : (
                    d.d && <span className="v-muted v-clamp">{d.d}</span>
                  )}
                  {(d.dd || d.cd) && <span className="v-muted mono">{d.dd && `сут.: ${d.dd}`}{d.dd && d.cd ? ' · ' : ''}{d.cd && `курс: ${d.cd}`}</span>}
                </div>
                {done ? (
                  <span className="v-btn v-btn--done"><Icon name="check" size={16} /> {d.g === 'procedure' ? 'В рекомендациях' : 'В плане'}</span>
                ) : (
                  <button type="button" className="v-btn v-btn--line" onClick={() => (d.g === 'procedure' ? addProcedure(d) : addToPlan(d, g))}>
                    <Icon name="plus" size={16} /> {d.g === 'procedure' ? 'В рекомендации' : 'В план'}
                  </button>
                )}
              </li>
            );
          })}
        {tab !== 'diag' && drugs.length === 0 && <li className="v-muted">Ничего не найдено</li>}
      </ul>
      <p className="v-muted v-small">Подсказки собраны из таблиц стандартов МЗ РУз. Перед назначением сверяйте дозы с первоисточником.</p>
    </>
  );
}

function ProtocolCard() {
  const code = useEnc((s) => s.soap.assessment.primaryDiagnosis.icd10Code);
  const topical = useEnc((s) => s.soap.plan.topicalTherapy);
  const systemic = useEnc((s) => s.soap.plan.systemicTherapy);
  const all = useGuidelines();
  const [pick, setPick] = useState(0);
  const matches = useMemo(() => (all && code ? matchGuidelines(all, code) : []), [all, code]);
  if (!code) return <Card eyebrow="Протокол МЗ РУз" title="Выберите диагноз"><p className="v-muted">После выбора диагноза здесь появится стандарт лечения: препараты, процедуры и обследования.</p></Card>;
  if (!all) return <Card eyebrow="Протокол МЗ РУз" title="Загрузка…"><p className="v-muted">Загружаются клинические протоколы.</p></Card>;
  if (!matches.length) return <Card eyebrow="Протокол МЗ РУз" title="Протокола нет в базе"><p className="v-muted">Для диагноза <span className="mono">{code}</span> нет загруженного протокола МЗ РУз — назначайте по клиническому опыту и шаблонам клиники.</p></Card>;
  const g = matches[Math.min(pick, matches.length - 1)];
  const outside = [...topical, ...systemic].map((x) => x.drugName).filter(Boolean).filter((n) => !matches.some((m) => drugInGuideline(m, n)));
  return (
    <Card eyebrow="Протокол МЗ РУз" title={`${g.title} · стандарт лечения`} className="v-protocol">
      {matches.length > 1 && <div className="v-pills">{matches.map((m, i) => <Pill key={m.id} on={m.id === g.id} onClick={() => setPick(i)}>{m.title}</Pill>)}</div>}
      {outside.length > 0 && <div className="v-note v-note--warn"><Icon name="alert" size={16} /> Нет в стандарте: {outside.join(', ')}</div>}
      <ProtocolBody key={g.id} g={g} />
    </Card>
  );
}

/** Шаг 3. Диагноз по МКБ-10 и стандарт лечения МЗ РУз рядом. */
export function DiagnosisStep({ onCalc }: { onCalc: () => void }) {
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
      <ProtocolCard />
    </div>
  );
}
