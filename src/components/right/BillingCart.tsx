import { useState } from 'react';
import { addService, cartTotals, encounter, flushSave, setServiceQty, toast, useEnc } from '../../state';
import { searchPrice } from '../../data/priceList';
import { syncBilling } from '../../lib/api';
import { Segmented, Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { PriceCell, priceLabel, priceName, serviceName } from '../ui/Price';
import type { BillingCategory, PayerType } from '../../types';
import { tr, money } from '../../lib/i18n';

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
      toast(`${tr('Касса недоступна')}: ${(e as Error).message}`, 'danger');
      return;
    }
    encounter.set((s) => {
      s.billing.status = 'SENT_TO_CASHIER';
      s.billing.sentAt = new Date().toISOString();
    });
    setSending(false);
    toast(isUpdate ? tr('Счет обновлен — кассир получил уведомление') : `${tr('Счёт передан на кассу')} · ${money(totals.renderedFinal)}`, 'success');
    console.info('[billing]', res.event);
  };

  const sendLabel =
    billing.status === 'PAID' ? tr('Оплачено ✓') : billing.status === 'SENT_TO_CASHIER' ? tr('Передано на кассу ✓') : billing.status === 'UPDATED_AFTER_SEND' ? tr('Отправить обновление на кассу') : tr('Передать на кассу');

  return (
    <section className="panel" aria-label={tr('Корзина услуг')}>
      <div className="panel__head">
        <h2 className="panel__title">{tr('Услуги визита')}</h2>
        {billing.status === 'UPDATED_AFTER_SEND' && <span className="status-pill status-pill--warn">{tr('изменено после передачи')}</span>}
      </div>
      <Segmented<BillingCategory>
        options={[
          { value: 'RENDERED', label: <>{tr('Сегодня')} <span className="seg__count mono">{count('RENDERED')}</span></> },
          { value: 'PRESCRIBED', label: <>{tr('План')} <span className="seg__count mono">{count('PRESCRIBED')}</span></> },
        ]}
        value={tab}
        onChange={setTab}
      />

      <ul className="cart">
        {visible.map((i) => (
          <li key={i.id} className="cart__row">
            <div className="cart__name">{serviceName(i)}</div>
            <span className="cart__code mono">{i.serviceCode}{i.source === 'AUTO_FROM_SOAP' ? tr(' · из протокола') : ''}</span>
            <span className="cart__controls">
              <Stepper value={i.quantity} onChange={(v) => setServiceQty(i.id, v)} />
              <PriceCell item={i} className="cart__price" />
            </span>
          </li>
        ))}
        {!visible.length && <li className="cart__empty">{tr('Нет позиций')}</li>}
      </ul>

      <div className="combo combo--sm">
        <span className="combo__icon"><Icon name="plus" size={14} /></span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Добавить услугу из прайса')} aria-label={tr('Добавить услугу')} />
        {results.length > 0 && (
          <div className="combo__list">
            {results.map((r) => (
              <button key={r.code} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); addService(r, tab); setQ(''); }}>
                {priceName(r)} <span className="combo__price mono">{priceLabel(r)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cart__payer">
        <select className="select select--xs" value={billing.payerType} aria-label={tr('Плательщик')} onChange={(e) => encounter.set((s) => { s.billing.payerType = e.target.value as PayerType; if (s.billing.status === 'SENT_TO_CASHIER') s.billing.status = 'UPDATED_AFTER_SEND'; })}>
          <option value="CASH">{tr('Наличные / карта')}</option>
          <option value="DMS">{tr('ДМС')}</option>
          <option value="CORPORATE">{tr('Корпоративный договор')}</option>
        </select>
        <label className="cart__discount">
          {tr('Скидка')}
          <input className="input input--xs mono" type="number" min={0} max={100} value={billing.discountPercent} onChange={(e) => encounter.set((s) => { s.billing.discountPercent = Number(e.target.value); if (s.billing.status === 'SENT_TO_CASHIER') s.billing.status = 'UPDATED_AFTER_SEND'; })} />%
        </label>
      </div>

      <div className="cart__total">
        <span>{tab === 'RENDERED' ? tr('К оплате сейчас') : tr('Смета на будущее')}{billing.payerType === 'DMS' ? tr(' · ДМС') : ''}</span>
        <span className="cart__sum mono">{money(tab === 'RENDERED' ? totals.renderedFinal : totals.prescribedFinal)}</span>
      </div>
      <button type="button" className={`btn btn--instrument btn--block${billing.status === 'SENT_TO_CASHIER' || billing.status === 'PAID' ? ' is-done' : ''}`} onClick={send} disabled={sending || billing.status === 'SENT_TO_CASHIER' || billing.status === 'PAID'}>
        {sending ? tr('Передача…') : sendLabel}
      </button>
    </section>
  );
}
