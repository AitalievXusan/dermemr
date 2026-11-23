import { useState, type ReactNode } from 'react';
import { updateSoap, useEnc } from '../state';
import { CareRow, DrugDatalists, ExtemporalRx, SystemicRx, TopicalRx } from '../components/center/SectionP';
import { addProcedure } from '../components/center/GuidelinePanel';
import { EXTEMPORAL_TEMPLATES } from '../data/extemporal';
import { checkDrug, type CdssAlert } from '../lib/cdss';
import { drugInGuideline, type Guideline } from '../lib/guidelines';
import { dateRu } from '../lib/format';
import { uid } from '../lib/store';
import { Icon } from '../components/ui/Icon';
import { Card, Pill, Tag, TextField } from './ui';
import { useProtocol } from './LabsCard';
import { ProtocolCard } from './ProtocolCard';

/** Строка назначения: кратко, по кнопке «Изменить» — полный редактор. */
function RxRow({ form, name, line, duration, std, editor }: { form: string; name: string; line: string; duration: string; std: boolean | null; editor: ReactNode }) {
  const [open, setOpen] = useState(!name);
  return (
    <div className={`v-rx${open ? ' is-open' : ''}`}>
      <div className="v-rx__line">
        <span className="v-rx__form">{form}</span>
        <div className="v-rx__main">
          <span className="v-rx__name">
            <strong>{name || 'Новое назначение'}</strong>
            {std === true && <Tag tone="ok">в стандарте</Tag>}
            {std === false && <Tag tone="warn">вне стандарта</Tag>}
          </span>
          {line && <span className="v-muted">{line}</span>}
        </div>
        <strong className="v-rx__dur">{duration}</strong>
        <button type="button" className="v-btn v-btn--line" onClick={() => setOpen(!open)}>{open ? 'Готово' : 'Изменить'}</button>
      </div>
      {open && <div className="v-rx__editor">{editor}</div>}
    </div>
  );
}

function Drugs({ protocol }: { protocol: Guideline[] }) {
  const P = useEnc((s) => s.soap.plan);
  const [menu, setMenu] = useState(false);
  const std = (n: string) => (!protocol.length || !n ? null : protocol.some((g) => drugInGuideline(g, n)));
  const total = P.topicalTherapy.length + P.systemicTherapy.length + P.extemporalPrescriptions.length;
  const add = (kind: 'top' | 'sys') => {
    setMenu(false);
    if (kind === 'top') updateSoap((s) => { s.plan.topicalTherapy.push({ id: uid('top'), form: 'Крем', drugName: '', applicationZone: '', frequency: '1 раз в сутки', timeOfDaySlot: ['EVENING'], method: 'Тонким слоем', durationDays: 14, taperingScheme: '' }); });
    else updateSoap((s) => { s.plan.systemicTherapy.push({ id: uid('sys'), drugName: '', dose: '', regimen: '1 раз в сутки', mealRelation: 'во время еды', timeOfDaySlot: ['EVENING'], durationDays: 30, dailyDoseMg: 20 }); });
  };
  const addExt = (key: string) => {
    const t = EXTEMPORAL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setMenu(false);
    updateSoap((s) => { s.plan.extemporalPrescriptions.push({ id: uid('ext'), templateKey: t.key, title: t.title, form: t.form, composition: t.composition.map((c) => ({ ...c })), sig: t.sig, applicationZone: '', timeOfDaySlot: [...t.timeOfDaySlot], durationDays: t.durationDays }); });
  };
  return (
    <Card title="Препараты" aside={total || undefined}>
      <DrugDatalists />
      <span className="v-section">Наружная терапия</span>
      {P.topicalTherapy.length === 0 && <p className="v-empty">Не назначена.</p>}
      {P.topicalTherapy.map((t, i) => (
        <RxRow key={t.id} form={t.form} name={t.drugName} std={std(t.drugName)} duration={`${t.durationDays} дн.`}
          line={[t.frequency, t.method && t.method.toLowerCase(), t.applicationZone].filter(Boolean).join(' · ')}
          editor={<TopicalRx i={i} />} />
      ))}
      <span className="v-section">Системная терапия</span>
      {P.systemicTherapy.length === 0 && <p className="v-empty">Не назначена.{protocol.length ? ' Варианты по стандарту — ниже.' : ''}</p>}
      {P.systemicTherapy.map((t, i) => (
        <RxRow key={t.id} form="Внутрь" name={t.drugName} std={std(t.drugName)} duration={`${t.durationDays} дн.`}
          line={[t.dose, t.regimen, t.mealRelation].filter(Boolean).join(' · ')}
          editor={<SystemicRx i={i} />} />
      ))}
      {P.extemporalPrescriptions.length > 0 && <span className="v-section">Экстемпоральные прописи</span>}
      {P.extemporalPrescriptions.map((x, i) => (
        <RxRow key={x.id} form={x.form.replace(/^M\.f\.\s*/i, '') || 'Пропись'} name={x.title} std={null} duration={`${x.durationDays} дн.`} line={x.sig} editor={<ExtemporalRx i={i} />} />
      ))}
      {menu ? (
        <div className="v-addmenu">
          <button type="button" className="v-btn v-btn--line" onClick={() => add('top')}><Icon name="plus" size={16} /> Наружный препарат</button>
          <button type="button" className="v-btn v-btn--line" onClick={() => add('sys')}><Icon name="plus" size={16} /> Системный препарат</button>
          <select className="v-select" value="" aria-label="Пропись из шаблона" onChange={(e) => addExt(e.target.value)}>
            <option value="">+ Пропись из шаблона…</option>
            {EXTEMPORAL_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
          </select>
          <button type="button" className="v-btn v-btn--soft" onClick={() => setMenu(false)}>Отмена</button>
        </div>
      ) : (
        <button type="button" className="v-btn v-btn--dashed" onClick={() => setMenu(true)}><Icon name="plus" size={18} /> Добавить препарат</button>
      )}
    </Card>
  );
}

function Checks({ protocol }: { protocol: Guideline[] }) {
  const P = useEnc((s) => s.soap.plan);
  const patient = useEnc((s) => s.patient);
  const names = [...P.topicalTherapy, ...P.systemicTherapy].map((x) => x.drugName).filter(Boolean);
  const alerts: CdssAlert[] = [];
  names.forEach((n) => checkDrug(n, patient, names.filter((x) => x !== n)).forEach((a) => {
    if (!alerts.some((b) => b.message === a.message)) alerts.push(a);
  }));
  const outside = protocol.length ? names.filter((n) => !protocol.some((g) => drugInGuideline(g, n))) : [];
  const due = new Date(Date.now() + P.followUpDays * 86400000);
  const presets = [{ d: 14, l: '2 недели' }, { d: 28, l: '4 недели' }, { d: 90, l: '3 месяца' }];
  return (
    <Card title="Проверка назначений" className="v-card--side">
      {alerts.length === 0 ? (
        <div className="v-note v-note--ok"><Icon name="check" size={18} /><div><strong>Конфликтов нет</strong><span>Аллергии, беременность, взаимодействия</span></div></div>
      ) : alerts.map((a) => (
        <div key={a.message} className={`v-note ${a.level === 'BLOCKING_ALERT' ? 'v-note--danger' : 'v-note--warn'}`}><Icon name="alert" size={18} /><div><strong>{a.title}</strong><span>{a.message}</span></div></div>
      ))}
      {outside.length > 0 && (
        <div className="v-note v-note--warn"><Icon name="alert" size={18} /><div><strong>Вне стандарта: {outside.length}</strong><span>{outside.join(', ')} — в стандарте МЗ РУз по этой нозологии нет</span></div></div>
      )}
      <hr className="v-hr" />
      <h2 className="v-card__title">Следующий визит</h2>
      <div className="v-pills">
        {presets.map((p) => <Pill key={p.d} on={P.followUpDays === p.d} onClick={() => updateSoap((s) => { s.plan.followUpDays = p.d; })}>{p.l}</Pill>)}
        <label className="v-days"><input className="v-input v-input--num mono" type="number" min={1} value={P.followUpDays} aria-label="Через сколько дней" onChange={(e) => updateSoap((s) => { s.plan.followUpDays = Number(e.target.value); })} /> дн.</label>
      </div>
      {P.followUpDays > 0 && <p className="v-muted">Повторный приём · {dateRu(due)}</p>}
    </Card>
  );
}

function Procedures({ protocol }: { protocol: Guideline[] }) {
  const P = useEnc((s) => s.soap.plan);
  const [editCare, setEditCare] = useState<string | null>(null);
  const procs = protocol.flatMap((g) => g.drugs.filter((d) => d.g === 'procedure')).filter((d, i, arr) => arr.findIndex((x) => x.n === d.n) === i).slice(0, 8);
  const has = (n: string) => P.generalRecommendations.toLowerCase().includes(n.toLowerCase());
  const removeLine = (n: string) => updateSoap((s) => {
    s.plan.generalRecommendations = s.plan.generalRecommendations.split('\n').filter((l) => !l.toLowerCase().includes(n.toLowerCase())).join('\n');
  });
  return (
    <Card title="Процедуры и физиотерапия" className="v-card--side">
      {procs.length > 0 ? <span className="v-muted">по стандарту — попадут в рекомендации</span> : <span className="v-muted">Процедур в стандарте нет — впишите в рекомендации.</span>}
      <div className="v-stack v-stack--tight">
        {procs.map((d) => (
          <button key={d.n} type="button" className={`v-option${has(d.n) ? ' is-on' : ''}`} onClick={() => (has(d.n) ? removeLine(d.n) : addProcedure(d))}>
            <span className={`v-box${has(d.n) ? ' is-on' : ''}`}>{has(d.n) && <Icon name="check" size={16} />}</span>
            <span><strong>{d.n}</strong>{d.d && <span className="v-muted v-clamp">{d.d}</span>}</span>
          </button>
        ))}
      </div>
      <hr className="v-hr" />
      <h2 className="v-card__title">Уход</h2>
      <div className="v-pills">
        {P.skincareRoutine.map((c) => (
          <Pill key={c.id} on={editCare === c.id} onClick={() => setEditCare(editCare === c.id ? null : c.id)}>{c.step}: {c.productRecommendation}</Pill>
        ))}
        <button type="button" className="v-link" onClick={() => { const id = uid('care'); updateSoap((s) => { s.plan.skincareRoutine.push({ id, step: 'Увлажнение', productRecommendation: 'Эмолент', timeOfDaySlot: ['MORNING', 'EVENING'] }); }); setEditCare(id); }}>+ шаг ухода</button>
      </div>
      {editCare && P.skincareRoutine.some((c) => c.id === editCare) && (
        <div className="v-rx__editor"><CareRow i={P.skincareRoutine.findIndex((c) => c.id === editCare)} /></div>
      )}
      <TextField label="Общие рекомендации" value={P.generalRecommendations} onChange={(v) => updateSoap((s) => { s.plan.generalRecommendations = v; })} placeholder="Режим, ограничения…  /спф_режим" rows={3} />
    </Card>
  );
}

/** Шаг 4. Лечение: препараты и стандарт лечения МЗ РУз; справа — проверка назначений, следующий визит, процедуры и уход. */
export function TreatmentStep() {
  const protocol = useProtocol();
  return (
    <div className="v-grid v-grid--side">
      <div className="v-stack">
        <Drugs protocol={protocol} />
        <ProtocolCard />
      </div>
      <div className="v-stack">
        <Checks protocol={protocol} />
        <Procedures protocol={protocol} />
      </div>
    </div>
  );
}
