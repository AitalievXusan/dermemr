import { useEffect, useState } from 'react';
import { fetchCarts, payCart, type Cart } from '../lib/api';
import { joinRoom, leaveRoom, onEvent, startRealtime } from '../lib/ws';
import { timeHHMM } from '../lib/format';
import { toast } from '../state';
import { TopBar } from './QueuePage';
import { tr, money } from '../lib/i18n';
import { serviceName } from '../components/ui/Price';

const STATUS: Record<Cart['status'], string> = {
  DRAFT: 'Черновик', SENT_TO_CASHIER: 'К оплате', UPDATED_AFTER_SEND: 'Обновлен врачом', PAID: 'Оплачено',
};
const PAYER: Record<string, string> = { CASH: 'Наличные / карта', DMS: 'ДМС', CORPORATE: 'Корпоративный договор' };

/** Рабочее место кассира: счета приходят в реальном времени (SPEC §3.4, §6.1). */
export function CashierPage() {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchCarts().then(setCarts);
    startRealtime();
    joinRoom('cashier');
    const upsert = (c: Cart, highlight: boolean) => {
      setCarts((list) => [c, ...list.filter((x) => x.id !== c.id)]);
      if (highlight) setFresh((s) => new Set(s).add(c.id));
    };
    const offs = [
      onEvent('CASHIER_CART_RECEIVED', (c: Cart) => { upsert(c, true); toast(`${tr('Новый счёт')}: ${c.patientName}`); }),
      onEvent('CASHIER_CART_UPDATED', (c: Cart) => { upsert(c, true); toast(`${tr('Врач обновил счёт')}: ${c.patientName}`); }),
      onEvent('CASHIER_CART_PAID', (c: Cart) => upsert(c, false)),
    ];
    return () => { leaveRoom('cashier'); offs.forEach((o) => o()); };
  }, []);

  const pay = async (c: Cart) => {
    const paid = await payCart(c.id);
    setCarts((list) => list.map((x) => (x.id === c.id ? paid : x)));
    setFresh((s) => { const n = new Set(s); n.delete(c.id); return n; });
    toast(`${tr('Оплата принята')} · ${money(c.totalRendered)}`, 'success');
  };

  return (
    <div className="page">
      <TopBar title={tr('Касса и ресепшен')} />
      <div className="page__body">
        {!carts.length && <p className="muted">{tr('Счетов пока нет. Врач отправляет счет кнопкой «Передать на кассу».')}</p>}
        <div className="carts">
          {carts.map((c) => {
            const rendered = c.items.filter((i) => i.category === 'RENDERED');
            const planned = c.items.filter((i) => i.category === 'PRESCRIBED');
            return (
              <article key={c.id} className={`panel cartcard${fresh.has(c.id) ? ' is-fresh' : ''}`}>
                <div className="panel__head">
                  <h2 className="cartcard__name">{c.patientName}</h2>
                  <span className={`status-pill ${c.status === 'PAID' ? 'status-pill--ok' : c.status === 'UPDATED_AFTER_SEND' ? 'status-pill--warn' : 'status-pill--accent'}`}>{tr(STATUS[c.status])}</span>
                </div>
                <div className="muted">{tr(PAYER[c.payerType] ?? c.payerType)}{c.discountPercent ? ` · ${tr('скидка')} ${c.discountPercent}%` : ''} · {tr('получен')} <span className="mono">{timeHHMM(c.syncedAt)}</span></div>
                <h3 className="cartcard__h">{tr('Оказано на приеме — к оплате сейчас')}</h3>
                <ul className="cartcard__list">
                  {rendered.map((i) => <li key={i.id}><span>{serviceName(i)} × {i.quantity}</span><span className="mono">{money(i.finalPrice)}</span></li>)}
                </ul>
                <div className="cart__total"><span>{tr('Итого')}</span><span className="cart__sum mono">{money(c.totalRendered)}</span></div>
                {planned.length > 0 && (
                  <>
                    <h3 className="cartcard__h">{tr('Назначено на будущее — запись и смета')}</h3>
                    <ul className="cartcard__list cartcard__list--muted">
                      {planned.map((i) => <li key={i.id}><span>{serviceName(i)}</span><span className="mono">{money(i.finalPrice)}</span></li>)}
                    </ul>
                  </>
                )}
                <button type="button" className={`btn btn--block ${c.status === 'PAID' ? 'btn--instrument is-done' : 'btn--accent'}`} disabled={c.status === 'PAID'} onClick={() => pay(c)}>
                  {c.status === 'PAID' ? `${tr('Оплачено')} ${c.paidAt ? timeHHMM(c.paidAt) : ''} ✓` : tr('Принять оплату')}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
