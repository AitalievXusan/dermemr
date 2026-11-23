import { useMemo, useState } from 'react';
import { addService, cartTotals, setServiceCategory, setServiceQty, useEnc } from '../state';
import { PRICE_LIST, searchPrice, type PriceEntry } from '../data/priceList';
import { matchGuidelines, useGuidelines, type Guideline } from '../lib/guidelines';
import { rub } from '../lib/format';
import { uid } from '../lib/store';
import { Icon } from '../components/ui/Icon';
import type { BillingCategory } from '../types';
import { Card, Seg, Tag } from './ui';

// Обследования, анализы и услуги: выбранные услуги визита и подсказки из стандарта МЗ РУз с ценами прайса.

export function useProtocol(): Guideline[] {
  const code = useEnc((s) => s.soap.assessment.primaryDiagnosis.icd10Code);
  const all = useGuidelines();
  return useMemo(() => (all && code ? matchGuidelines(all, code) : []), [all, code]);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
/** Позиция прайса для обследования из стандарта: все значимые слова названия (до четырёх) есть в позиции прайса. */
function priceFor(name: string): PriceEntry | undefined {
  const stems = norm(name).split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 4).slice(0, 4).map((w) => w.slice(0, 6));
  if (!stems.length) return undefined;
  return PRICE_LIST.find((p) => stems.every((st) => norm(p.name).includes(st)));
}

export function LabsCard({ protocol }: { protocol: Guideline[] }) {
  const s = useEnc((x) => x);
  const items = s.soap.plan.proceduresAndLabs;
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const results = searchPrice(q, 6);
  const totals = cartTotals(s);
  const suggestions = protocol.flatMap((g) => g.diag).filter((d, i, arr) => arr.findIndex((x) => x.n === d.n) === i)
    .filter((d) => !items.some((it) => it.name.toLowerCase() === d.n.toLowerCase() || (priceFor(d.n) && it.serviceCode === priceFor(d.n)!.code)));
  const visible = showAll ? suggestions : suggestions.slice(0, 6);
  const addStd = (name: string) => {
    const pr = priceFor(name);
    addService(pr ?? { code: `MZ-${uid('lab').slice(-6)}`, name, price: 0, defaultCategory: 'PRESCRIBED' }, 'PRESCRIBED', 'AUTO_FROM_SOAP');
  };
  return (
    <Card title="Обследования, анализы и услуги" aside="по стандарту МЗ РУз · цены из прайса клиники">
      <ul className="v-labs">
        {items.map((it) => (
          <li key={it.id} className="v-lab is-on">
            <button type="button" className="v-box is-on" aria-label={`Убрать: ${it.name}`} onClick={() => setServiceQty(it.id, 0)}><Icon name="check" size={16} /></button>
            <span className="v-lab__name">{it.name}{it.quantity > 1 && <span className="v-muted"> × {it.quantity}</span>}</span>
            <Seg<BillingCategory> className="v-seg--xs" value={it.category} onChange={(v) => setServiceCategory(it.id, v)} options={[{ value: 'RENDERED', label: 'Сегодня' }, { value: 'PRESCRIBED', label: 'План' }]} />
            <span className="v-lab__price mono">{it.unitPrice ? rub(it.unitPrice * it.quantity) : '—'}</span>
          </li>
        ))}
        {visible.map((d) => {
          const pr = priceFor(d.n);
          return (
            <li key={d.n} className="v-lab">
              <button type="button" className="v-box" aria-label={`Добавить: ${d.n}`} onClick={() => addStd(d.n)} />
              <span className="v-lab__name">{d.n}</span>
              <Tag tone="neutral">{d.sp ? 'спец. уровень' : 'стандарт'}</Tag>
              <span className="v-lab__price mono">{pr ? rub(pr.price) : '—'}</span>
            </li>
          );
        })}
      </ul>
      <div className="v-row v-row--wrap">
        {suggestions.length > 6 && <button type="button" className="v-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Свернуть' : `Все ${suggestions.length} обследования из стандарта`}</button>}
        <span className="v-foot__spacer" />
        <span>Сегодня <strong className="mono">{rub(totals.renderedFinal)}</strong> · план <strong className="mono">{rub(totals.prescribedFinal)}</strong></span>
      </div>
      <div className="v-combo">
        <div className="combo">
          <span className="combo__icon"><Icon name="plus" size={16} /></span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Услуга из прайса: анализ, манипуляция…" aria-label="Услуга из прайса" />
          {results.length > 0 && (
            <div className="combo__list">
              {results.map((r) => (
                <button key={r.code} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); addService(r, r.defaultCategory); setQ(''); }}>
                  {r.name} <span className="combo__price mono">{rub(r.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
