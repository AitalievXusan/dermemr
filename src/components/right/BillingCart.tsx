import { useState } from 'react';
import { addService, cartTotals, encounter, flushSave, setServiceQty, toast, useEnc } from '../../state';
import { searchPrice } from '../../data/priceList';
import { syncBilling } from '../../lib/api';
import { rub } from '../../lib/format';
import { Segmented, Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import type { BillingCategory, PayerType } from '../../types';

/** Корзина услуг визита: вкладки «Сегодня» / «План», передача на кассу (PRD §4.4.1, DESIGN §5.4 А). */
export function BillingCart() {
  const state = useEnc((s) => s);
  const items = state.soap.plan.proceduresAndLabs;
  const billing = state.billing;
  const [tab, setTab] = useState<BillingCategory>('RENDERED');
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);
  const totals = cartTotals(state);
  const visible = items.filter((i) => i.category === tab);
  const count = (c: BillingCategory) => items.filter((i) => i.category === c).length;
  const results = searchPrice(q, 5);

  const send = async () => {
    setSending(true);
    const isUpdate = billing.status !== 'DRAFT';
    let res: { event: string };
    try {
      await flushSave(); // сервер строит счет по сохраненному протоколу
      res = await syncBilling(state.encounterId, isUpdate);
    } catch (e) {
      setSending(false);
      toast(`Касса недоступна: ${(e as Error).message}`, 'danger');
      return;
    }
    encounter.set((s) => {
      s.billing.status = 'SENT_TO_CASHIER';
      s.billing.sentAt = new Date().toISOString();
    });
    setSending(false);
    toast(isUpdate ? 'Счет обновлен — кассир получил уведомление' : `Счет передан на кассу · ${rub(totals.renderedFinal)}`, 'success');
    console.info('[billing]', res.event);
  };

  const sendLabel =
    billing.status === 'PAID' ? 'Оплачено ✓' : billing.status === 'SENT_TO_CASHIER' ? 'Передано на кассу ✓' : billing.status === 'UPDATED_AFTER_SEND' ? 'Отправить обновление на кассу' : 'Передать на кассу';

  return (
    <section className="panel" aria-label="Корзина услуг">
      <div className="panel__head">
        <h2 className="panel__title">Услуги визита</h2>
        {billing.status === 'UPDATED_AFTER_SEND' && <span className="status-pill status-pill--warn">изменено после передачи</span>}
      </div>
      <Segmented<BillingCategory>
        options={[
          { value: 'RENDERED', label: <>Сегодня <span className="seg__count mono">{count('RENDERED')}</span></> },
          { value: 'PRESCRIBED', label: <>План <span className="seg__count mono">{count('PRESCRIBED')}</span></> },
        ]}
        value={tab}
        onChange={setTab}
      />

      <ul className="cart">
        {visible.map((i) => (
          <li key={i.id} className="cart__row">
            <div className="cart__name">{i.name}</div>
            <span className="cart__code mono">{i.serviceCode}{i.source === 'AUTO_FROM_SOAP' ? ' · из протокола' : ''}</span>
            <span className="cart__controls">
              <Stepper value={i.quantity} onChange={(v) => setServiceQty(i.id, v)} />
              <span className="cart__price mono">{rub(i.unitPrice * i.quantity)}</span>
            </span>
          </li>
        ))}
        {!visible.length && <li className="cart__empty">Нет позиций</li>}
      </ul>

      <div className="combo combo--sm">
        <span className="combo__icon"><Icon name="plus" size={14} /></span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Добавить услугу из прайса" aria-label="Добавить услугу" />
        {results.length > 0 && (
          <div className="combo__list">
            {results.map((r) => (
              <button key={r.code} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); addService(r, tab); setQ(''); }}>
                {r.name} <span className="combo__price mono">{rub(r.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cart__payer">
        <select className="select select--xs" value={billing.payerType} aria-label="Плательщик" onChange={(e) => encounter.set((s) => { s.billing.payerType = e.target.value as PayerType; if (s.billing.status === 'SENT_TO_CASHIER') s.billing.status = 'UPDATED_AFTER_SEND'; })}>
          <option value="CASH">Наличные / карта</option>
          <option value="DMS">ДМС</option>
          <option value="CORPORATE">Корпоративный договор</option>
        </select>
        <label className="cart__discount">
          Скидка
          <input className="input input--xs mono" type="number" min={0} max={100} value={billing.discountPercent} onChange={(e) => encounter.set((s) => { s.billing.discountPercent = Number(e.target.value); if (s.billing.status === 'SENT_TO_CASHIER') s.billing.status = 'UPDATED_AFTER_SEND'; })} />%
        </label>
      </div>

      <div className="cart__total">
        <span>{tab === 'RENDERED' ? 'К оплате сейчас' : 'Смета на будущее'}{billing.payerType === 'DMS' ? ' · ДМС' : ''}</span>
        <span className="cart__sum mono">{rub(tab === 'RENDERED' ? totals.renderedFinal : totals.prescribedFinal)}</span>
      </div>
      <button type="button" className={`btn btn--instrument btn--block${billing.status === 'SENT_TO_CASHIER' || billing.status === 'PAID' ? ' is-done' : ''}`} onClick={send} disabled={sending || billing.status === 'SENT_TO_CASHIER' || billing.status === 'PAID'}>
        {sending ? 'Передача…' : sendLabel}
      </button>
    </section>
  );
}
