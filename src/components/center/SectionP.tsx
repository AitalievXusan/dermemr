import { useState } from 'react';
import { addService, encounter, setPatientWeight, setServiceCategory, setServiceQty, ui, updateSoap, useEnc, useUi } from '../../state';
import { cdssCheck } from '../../lib/api';
import { EXTEMPORAL_TEMPLATES } from '../../data/extemporal';
import { DRUGS, findDrug } from '../../data/drugs';
import { searchPrice } from '../../data/priceList';
import { cumulativeDosePerKg, isotretinoinTarget } from '../../lib/calculators';
import { rub, SLOT_LABEL } from '../../lib/format';
import { uid } from '../../lib/store';
import { Chip, Field, Segmented, Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { SmartText } from '../ui/SmartText';
import type { BillingCategory, TimeSlot } from '../../types';

const FORMS = ['Крем', 'Мазь', 'Гель', 'Лосьон', 'Эмульсия', 'Раствор', 'Спрей', 'Шампунь', 'Лак'];
const SLOTS: TimeSlot[] = ['MORNING', 'DAY', 'EVENING'];

function SlotPicker({ value, onChange }: { value: TimeSlot[]; onChange: (v: TimeSlot[]) => void }) {
  return (
    <div className="slots" role="group" aria-label="Время суток">
      {SLOTS.map((s) => (
        <Chip key={s} active={value.includes(s)} onClick={() => onChange(value.includes(s) ? value.filter((x) => x !== s) : SLOTS.filter((x) => x === s || value.includes(x)))}>
          {SLOT_LABEL[s]}
        </Chip>
      ))}
    </div>
  );
}

/** Ввод препарата: автокомплит из справочника + CDSS-проверка при выборе (SPEC §3.3). */
function DrugInput({ list, id, value, route }: { list: 'topicalTherapy' | 'systemicTherapy'; id: string; value: string; route: 'topical' | 'systemic' }) {
  const listId = `drugs-${route}`;
  return (
    <input
      className="input"
      list={listId}
      value={value}
      placeholder="Препарат (МНН / торговое название)"
      aria-label="Препарат"
      onChange={(e) => {
        const name = e.target.value;
        updateSoap((s) => {
          const item = (s.plan[list] as { id: string; drugName: string }[]).find((x) => x.id === id);
          if (item) item.drugName = name;
        });
        const exact = DRUGS.find((d) => d.name === name);
        if (exact) {
          // POST /api/v1/cdss/check: аллергии, тератогенность, межлекарственные взаимодействия
          const { soap, encounterId, patient } = encounter.get();
          const current = [...soap.plan.topicalTherapy, ...soap.plan.systemicTherapy].filter((x) => x.id !== id).map((x) => x.drugName);
          void cdssCheck(encounterId, name, current, patient).then((alerts) => {
            if (alerts.length) ui.set((u) => { u.cdss = { alerts, drugName: name, target: { list, id } }; });
          });
        }
      }}
    />
  );
}

function DrugDatalists() {
  return (
    <>
      <datalist id="drugs-topical">{DRUGS.filter((d) => d.route === 'topical').map((d) => <option key={d.name} value={d.name} />)}</datalist>
      <datalist id="drugs-systemic">{DRUGS.filter((d) => d.route !== 'topical').map((d) => <option key={d.name} value={d.name} />)}</datalist>
    </>
  );
}

function IsotretinoinCalc({ dailyDoseMg, days }: { dailyDoseMg: number; days: number }) {
  const weight = useEnc((s) => s.patient.weightKg);
  const prior = useEnc((s) => s.soap.plan.isotretinoinPriorMg);
  const historyMg = useUi((s) => s.isoHistoryMg);
  const { minMg, maxMg } = isotretinoinTarget(weight);
  const plannedTotal = prior + dailyDoseMg * days;
  const perKg = cumulativeDosePerKg([{ dailyDoseMg: 1, days: plannedTotal }], weight);
  const scaleMax = maxMg * 1.15;
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  return (
    <div className="iso">
      <div className="iso__row">
        <Field label="Вес, кг" inline>
          <input className="input input--xs mono" type="number" min={1} value={weight} onChange={(e) => setPatientWeight(Number(e.target.value))} />
        </Field>
        <Field label="Уже принято, мг" inline>
          <input className="input input--xs mono" type="number" min={0} value={prior} onChange={(e) => updateSoap((s) => { s.plan.isotretinoinPriorMg = Number(e.target.value); })} />
        </Field>
      </div>
      {historyMg > 0 && historyMg !== prior && (
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => updateSoap((s) => { s.plan.isotretinoinPriorMg = historyMg; })}>
          По прошлым визитам принято {historyMg} мг — учесть
        </button>
      )}
      <div className="iso__target">
        Целевая кумулятивная доза <span className="mono">120–150 мг/кг</span> = <strong className="mono">{minMg}–{maxMg} мг</strong>
      </div>
      <div className="iso__bar" aria-label="Прогресс кумулятивной дозы">
        <span className="iso__fill iso__fill--prior" style={{ width: pct(prior) }} />
        <span className="iso__fill" style={{ left: pct(prior), width: `calc(${pct(plannedTotal)} - ${pct(prior)})` }} />
        <span className="iso__tick" style={{ left: pct(minMg) }} />
        <span className="iso__tick" style={{ left: pct(maxMg) }} />
      </div>
      <div className="iso__legend mono">
        <span>принято {prior} мг</span>
        <span>с этим курсом {plannedTotal} мг · {perKg} мг/кг</span>
      </div>
    </div>
  );
}

function ServiceSearch() {
  const [q, setQ] = useState('');
  const results = searchPrice(q);
  return (
    <div className="combo">
      <span className="combo__icon"><Icon name="search" size={14} /></span>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Анализы, исследования, манипуляции…" aria-label="Поиск по прайсу" />
      {results.length > 0 && (
        <div className="combo__list" role="listbox">
          {results.map((r) => (
            <button key={r.code} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); addService(r, r.defaultCategory, 'AUTO_FROM_SOAP'); setQ(''); }}>
              <span className="mono">{r.code}</span> {r.name} <span className="combo__price mono">{rub(r.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SectionP() {
  const P = useEnc((s) => s.soap.plan);

  return (
    <section className="soap__section" id="soap-p">
      <div className="soap__marker">P</div>
      <div className="soap__body">
        <DrugDatalists />

        <div className="soap__field">
          <span className="soap__label soap__label--between">
            Наружная терапия
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => updateSoap((s) => { s.plan.topicalTherapy.push({ id: uid('top'), form: 'Крем', drugName: '', applicationZone: '', frequency: '1 раз в сутки', timeOfDaySlot: ['EVENING'], method: 'Тонким слоем', durationDays: 14, taperingScheme: '' }); })}>
              <Icon name="plus" size={14} /> Назначение
            </button>
          </span>
          {P.topicalTherapy.map((t, i) => (
            <div key={t.id} className="rx">
              <div className="rx__line">
                <select className="select" value={t.form} aria-label="Форма" onChange={(e) => updateSoap((s) => { s.plan.topicalTherapy[i].form = e.target.value; })}>
                  {FORMS.map((f) => <option key={f}>{f}</option>)}
                </select>
                <DrugInput list="topicalTherapy" id={t.id} value={t.drugName} route="topical" />
                <button type="button" className="icon-btn" aria-label="Удалить назначение" onClick={() => updateSoap((s) => { s.plan.topicalTherapy.splice(i, 1); })}><Icon name="trash" size={14} /></button>
              </div>
              <div className="rx__line">
                <input className="input" value={t.applicationZone} placeholder="Зона нанесения" aria-label="Зона нанесения" onChange={(e) => updateSoap((s) => { s.plan.topicalTherapy[i].applicationZone = e.target.value; })} />
                <input className="input" value={t.frequency} placeholder="Кратность" aria-label="Кратность" onChange={(e) => updateSoap((s) => { s.plan.topicalTherapy[i].frequency = e.target.value; })} />
              </div>
              <div className="rx__line">
                <SlotPicker value={t.timeOfDaySlot} onChange={(v) => updateSoap((s) => { s.plan.topicalTherapy[i].timeOfDaySlot = v; })} />
                <input className="input" value={t.method} placeholder="Способ" aria-label="Способ" onChange={(e) => updateSoap((s) => { s.plan.topicalTherapy[i].method = e.target.value; })} />
                <label className="rx__days"><input className="input input--xs mono" type="number" min={1} value={t.durationDays} aria-label="Длительность курса, дней" onChange={(e) => updateSoap((s) => { s.plan.topicalTherapy[i].durationDays = Number(e.target.value); })} /> дн.</label>
              </div>
              <SmartText value={t.taperingScheme} placeholder="Схема отмены…  /тгкс_отмена" ariaLabel="Схема отмены" onChange={(v) => updateSoap((s) => { s.plan.topicalTherapy[i].taperingScheme = v; })} />
            </div>
          ))}
        </div>

        <div className="soap__field">
          <span className="soap__label soap__label--between">
            Системная терапия
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => updateSoap((s) => { s.plan.systemicTherapy.push({ id: uid('sys'), drugName: '', dose: '', regimen: '1 раз в сутки', mealRelation: 'во время еды', timeOfDaySlot: ['EVENING'], durationDays: 30, dailyDoseMg: 20 }); })}>
              <Icon name="plus" size={14} /> Назначение
            </button>
          </span>
          {P.systemicTherapy.map((t, i) => {
            const isIso = findDrug(t.drugName)?.inn === 'isotretinoin';
            return (
              <div key={t.id} className="rx">
                <div className="rx__line">
                  <DrugInput list="systemicTherapy" id={t.id} value={t.drugName} route="systemic" />
                  <input className="input input--sm mono" value={t.dose} placeholder="Доза" aria-label="Доза" onChange={(e) => updateSoap((s) => { s.plan.systemicTherapy[i].dose = e.target.value; })} />
                  <button type="button" className="icon-btn" aria-label="Удалить назначение" onClick={() => updateSoap((s) => { s.plan.systemicTherapy.splice(i, 1); })}><Icon name="trash" size={14} /></button>
                </div>
                <div className="rx__line">
                  <input className="input" value={t.regimen} placeholder="Режим приема" aria-label="Режим" onChange={(e) => updateSoap((s) => { s.plan.systemicTherapy[i].regimen = e.target.value; })} />
                  <input className="input" value={t.mealRelation} placeholder="Связь с едой" aria-label="Связь с едой" onChange={(e) => updateSoap((s) => { s.plan.systemicTherapy[i].mealRelation = e.target.value; })} />
                </div>
                <div className="rx__line">
                  <SlotPicker value={t.timeOfDaySlot} onChange={(v) => updateSoap((s) => { s.plan.systemicTherapy[i].timeOfDaySlot = v; })} />
                  {isIso && (
                    <label className="rx__days"><input className="input input--xs mono" type="number" min={0} value={t.dailyDoseMg ?? 0} aria-label="Суточная доза, мг" onChange={(e) => updateSoap((s) => { s.plan.systemicTherapy[i].dailyDoseMg = Number(e.target.value); })} /> мг/сут</label>
                  )}
                  <label className="rx__days"><input className="input input--xs mono" type="number" min={1} value={t.durationDays} aria-label="Длительность, дней" onChange={(e) => updateSoap((s) => { s.plan.systemicTherapy[i].durationDays = Number(e.target.value); })} /> дн.</label>
                </div>
                {isIso && <IsotretinoinCalc dailyDoseMg={t.dailyDoseMg ?? 0} days={t.durationDays} />}
              </div>
            );
          })}
        </div>

        <div className="soap__field">
          <span className="soap__label soap__label--between">
            Экстемпоральные прописи
            <select
              className="select select--xs"
              value=""
              aria-label="Добавить пропись"
              onChange={(e) => {
                const t = EXTEMPORAL_TEMPLATES.find((x) => x.key === e.target.value);
                if (t) updateSoap((s) => { s.plan.extemporalPrescriptions.push({ id: uid('ext'), templateKey: t.key, title: t.title, form: t.form, composition: t.composition.map((c) => ({ ...c })), sig: t.sig, applicationZone: '', timeOfDaySlot: [...t.timeOfDaySlot], durationDays: t.durationDays }); });
              }}
            >
              <option value="">+ Пропись из шаблона…</option>
              {EXTEMPORAL_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
            </select>
          </span>
          {P.extemporalPrescriptions.map((x, i) => (
            <div key={x.id} className="rx">
              <div className="rx__line">
                <strong className="rx__title">{x.title}</strong>
                <button type="button" className="icon-btn" aria-label="Удалить пропись" onClick={() => updateSoap((s) => { s.plan.extemporalPrescriptions.splice(i, 1); })}><Icon name="trash" size={14} /></button>
              </div>
              <div className="rx__comp mono">
                <span>Rp.:</span>
                {x.composition.map((c, j) => (
                  <span key={j} className="rx__ing">
                    {c.ingredient}
                    <input className="input input--xs mono" value={c.amount} aria-label={`Количество ${c.ingredient}`} onChange={(e) => updateSoap((s) => { s.plan.extemporalPrescriptions[i].composition[j].amount = e.target.value; })} />
                  </span>
                ))}
                <span>{x.form}</span>
              </div>
              <div className="rx__line">
                <input className="input" value={x.applicationZone} placeholder="Зона нанесения" aria-label="Зона нанесения" onChange={(e) => updateSoap((s) => { s.plan.extemporalPrescriptions[i].applicationZone = e.target.value; })} />
                <SlotPicker value={x.timeOfDaySlot} onChange={(v) => updateSoap((s) => { s.plan.extemporalPrescriptions[i].timeOfDaySlot = v; })} />
                <label className="rx__days"><input className="input input--xs mono" type="number" min={1} value={x.durationDays} aria-label="Длительность, дней" onChange={(e) => updateSoap((s) => { s.plan.extemporalPrescriptions[i].durationDays = Number(e.target.value); })} /> дн.</label>
              </div>
              <SmartText value={x.sig} placeholder="D.S. — способ применения" ariaLabel="Сигнатура" onChange={(v) => updateSoap((s) => { s.plan.extemporalPrescriptions[i].sig = v; })} />
            </div>
          ))}
        </div>

        <div className="soap__field">
          <span className="soap__label soap__label--between">
            Базовый уход
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => updateSoap((s) => { s.plan.skincareRoutine.push({ id: uid('care'), step: 'Фотозащита', productRecommendation: 'SPF 50+', timeOfDaySlot: ['MORNING'] }); })}>
              <Icon name="plus" size={14} /> Шаг ухода
            </button>
          </span>
          {P.skincareRoutine.map((c, i) => (
            <div key={c.id} className="rx__line rx__line--care">
              <select className="select" value={c.step} aria-label="Шаг ухода" onChange={(e) => updateSoap((s) => { s.plan.skincareRoutine[i].step = e.target.value; })}>
                {['Очищение', 'Увлажнение', 'Фотозащита'].map((x) => <option key={x}>{x}</option>)}
              </select>
              <input className="input" value={c.productRecommendation} aria-label="Средство" onChange={(e) => updateSoap((s) => { s.plan.skincareRoutine[i].productRecommendation = e.target.value; })} />
              <SlotPicker value={c.timeOfDaySlot} onChange={(v) => updateSoap((s) => { s.plan.skincareRoutine[i].timeOfDaySlot = v; })} />
              <button type="button" className="icon-btn" aria-label="Удалить шаг" onClick={() => updateSoap((s) => { s.plan.skincareRoutine.splice(i, 1); })}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>

        <div className="soap__field">
          <span className="soap__label">Диагностика и манипуляции <span className="soap__hint">— синхронизируются с корзиной услуг</span></span>
          <ServiceSearch />
          <ul className="procs">
            {P.proceduresAndLabs.map((p) => (
              <li key={p.id} className="procs__row">
                <span className="procs__name">{p.name}</span>
                <Segmented<BillingCategory> size="sm" options={[{ value: 'RENDERED', label: 'Сегодня' }, { value: 'PRESCRIBED', label: 'План' }]} value={p.category} onChange={(v) => setServiceCategory(p.id, v)} />
                <Stepper value={p.quantity} onChange={(v) => setServiceQty(p.id, v)} />
              </li>
            ))}
          </ul>
        </div>

        <div className="soap__grid2">
          <Field label="Контрольный визит через, дней">
            <input className="input mono" type="number" min={1} value={P.followUpDays} onChange={(e) => updateSoap((s) => { s.plan.followUpDays = Number(e.target.value); })} />
          </Field>
        </div>
        <div className="soap__field">
          <span className="soap__label">Общие рекомендации</span>
          <SmartText minRows={2} value={P.generalRecommendations} onChange={(v) => updateSoap((s) => { s.plan.generalRecommendations = v; })} placeholder="Режим, ограничения…  /спф_режим" ariaLabel="Общие рекомендации" />
        </div>
      </div>
    </section>
  );
}
