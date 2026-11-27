import { useState } from 'react';
import { addService, cartTotals, encounter, flushSave, setServiceQty, toast, ui, useEnc } from '../state';
import { syncBilling } from '../lib/api';
import { rxDrugs } from '../lib/documents';
import { searchPrice } from '../data/priceList';
import { dateRu } from '../lib/format';
import { money, plural } from '../lib/i18n';
import { SEVERITIES, stagesFor } from '../components/center/SectionA';
import { Icon } from '../components/ui/Icon';
import type { DocsSelection } from '../types';
import { Card } from './ui';
import { PriceCell, priceLabel, priceName, serviceName } from '../components/ui/Price';
import { tr } from '../lib/i18n';

function DocRow({ on, disabled, title, sub, onChange }: { on: boolean; disabled?: boolean; title: string; sub: string; onChange: (v: boolean) => void }) {
  return (
    <label className={`v-doc${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`v-box${on ? ' is-on' : ''}`} aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
      <span className="v-doc__text"><strong>{tr(title)}</strong><span className="v-muted">{tr(sub)}</span></span>
      <Icon name="fileText" size={20} />
    </label>
  );
}

/** Шаг 5. Итог приёма, документы для пациента, оплата и передача на кассу, курс дневного стационара. */
export function SummaryStep({ onDayHospital }: { onDayHospital?: () => void }) {
  const s = useEnc((x) => x);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);
  const dx = s.soap.assessment.primaryDiagnosis;
  const P = s.soap.plan;
  const totals = cartTotals(s);
  const today = P.proceduresAndLabs.filter((i) => i.category === 'RENDERED');
  const planned = P.proceduresAndLabs.filter((i) => i.category === 'PRESCRIBED');
  const calcs = Object.entries(s.soap.assessment.calculators).map(([k, v]) => `${k} ${v?.score}`);
  const nDrugs = P.topicalTherapy.length + P.systemicTherapy.length + P.extemporalPrescriptions.length;
  const hasRx = rxDrugs(s).length > 0 || P.extemporalPrescriptions.length > 0;
  const setDoc = (k: keyof DocsSelection, v: boolean) => encounter.set((d) => { d.docs[k] = v; });
  const sev = SEVERITIES.find((x) => x.value === dx.severity)?.label;
  const stage = stagesFor(dx.icd10Code).find((x) => x.value === dx.stage)?.label;
  const results = searchPrice(q, 5);
  const billing = s.billing;

  const finish = async () => {
    setSending(true);
    try {
      await flushSave();
      if (billing.status !== 'SENT_TO_CASHIER' && billing.status !== 'PAID') {
        await syncBilling(s.encounterId, billing.status !== 'DRAFT');
        encounter.set((d) => { d.billing.status = 'SENT_TO_CASHIER'; d.billing.sentAt = new Date().toISOString(); });
        toast(`${tr('Счёт передан на кассу')} · ${money(totals.renderedFinal)}`, 'success');
      }
      ui.set((u) => { u.docsModalOpen = true; });
    } catch (e) {
      toast(`${tr('Касса недоступна')}: ${(e as Error).message}`, 'danger');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="v-grid v-grid--side">
      <div className="v-stack">
        <Card title={tr('Итог приёма')} aside={tr('проверьте перед завершением')}>
          <dl className="v-summary">
            <dt>{tr('Диагноз')}</dt>
            <dd>{dx.icd10Code ? `${dx.icd10Code} ${dx.icd10Name}${sev ? `, ${tr('{x} тяжести', { x: tr(sev).toLowerCase() })}` : ''}${stage ? `, ${tr('{x} стадия', { x: tr(stage).toLowerCase() })}` : ''}` : <span className="v-danger">{tr('не указан — вернитесь к шагу «Диагноз»')}</span>}</dd>
            <dt>{tr('Осмотр')}</dt>
            <dd>{s.markers.length} {plural(s.markers.length, 'очаг', 'очага', 'очагов', 'ўчоқ')}{calcs.length ? ` · ${calcs.join(' · ')}` : ''}</dd>
            <dt>{tr('Назначения')}</dt>
            <dd>{nDrugs} {plural(nDrugs, 'препарат', 'препарата', 'препаратов', 'дори')}{planned.length ? ` · ${planned.length} ${plural(planned.length, 'обследование', 'обследования', 'обследований', 'текширув')}` : ''}{P.skincareRoutine.length ? ` · ${tr('уход')}: ${P.skincareRoutine.length}` : ''}</dd>
            <dt>{tr('Повторно')}</dt>
            <dd>{P.followUpDays ? `${dateRu(Date.now() + P.followUpDays * 86400000)} (${tr('через {n} дн.', { n: P.followUpDays })})` : tr('не назначено')}</dd>
          </dl>
          <h2 className="v-card__title">{tr('Документы')}</h2>
          <div className="v-stack v-stack--tight">
            <DocRow on={s.docs.summary} title={tr('Заключение врача')} sub="PDF и ссылка для пациента" onChange={(v) => setDoc('summary', v)} />
            {s.docs.summary && <DocRow on={s.docs.attachDermatoscopy} title={tr('Приложить снимки дерматоскопии')} sub="к заключению" onChange={(v) => setDoc('attachDermatoscopy', v)} />}
            <DocRow on={s.docs.prescriptions && hasRx} disabled={!hasRx} title={tr('Рецепт')} sub={hasRx ? tr('форма 107-1/у и прописи') : tr('нет рецептурных препаратов')} onChange={(v) => setDoc('prescriptions', v)} />
            <DocRow on={s.docs.memo} title={tr('Памятка по уходу')} sub="схема применения по времени суток" onChange={(v) => setDoc('memo', v)} />
            <DocRow on={s.docs.estimate} title={tr('Смета рекомендованных услуг')} sub="обследования по плану" onChange={(v) => setDoc('estimate', v)} />
          </div>
          <p className="v-muted v-small">{tr('ИДС на электронные каналы')}: {s.patient.communicationConsent ? <span className="v-ok">{tr('подписано')}</span> : <span className="v-danger">{tr('не подписано')}</span>}</p>
        </Card>
      </div>

      <Card title={tr('Оплата')} className="v-card--side">
        <ul className="v-pay">
          {today.map((i) => (
            <li key={i.id}>
              <span>{serviceName(i)}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
              <PriceCell item={i} />
              <button type="button" className="v-icon v-icon--sm" aria-label={tr('Убрать: {name}', { name: serviceName(i) })} onClick={() => setServiceQty(i.id, 0)}><Icon name="x" size={14} /></button>
            </li>
          ))}
          {!today.length && <li className="v-muted">{tr('Услуг за сегодня нет')}</li>}
        </ul>
        <div className="v-combo">
          <div className="combo">
            <span className="combo__icon"><Icon name="plus" size={16} /></span>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); addService(results[0], 'RENDERED'); setQ(''); } if (e.key === 'Escape') setQ(''); }} placeholder={tr('Услуга из прайса')} aria-label={tr('Услуга из прайса')} />
            {results.length > 0 && (
              <div className="combo__list">
                {results.map((r) => (
                  <button key={r.code} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); addService(r, 'RENDERED'); setQ(''); }}>
                    {priceName(r)} <span className="combo__price mono">{priceLabel(r)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {billing.discountPercent > 0 && <p className="v-muted">{tr('Скидка')} {billing.discountPercent}%</p>}
        <div className="v-total"><span>{tr('К оплате')}</span><strong className="mono">{money(totals.renderedFinal)}</strong></div>
        {today.some((i) => !i.unitPrice) && <p className="v-note v-note--warn">{tr('У части услуг нет цены — впишите сумму в поле напротив услуги.')}</p>}
        {totals.prescribedFinal > 0 && <p className="v-muted v-small">{tr('Рекомендовано по плану')}: {money(totals.prescribedFinal)}</p>}
        <button type="button" className="v-btn v-btn--ink v-btn--lg v-btn--block" disabled={sending} onClick={() => void finish()}>
          {tr(sending ? tr('Передача…') : billing.status === 'PAID' ? tr('Оплачено · документы') : billing.status === 'SENT_TO_CASHIER' ? tr('На кассе · сформировать документы') : tr('Завершить и передать на кассу'))}
        </button>
        {billing.status === 'UPDATED_AFTER_SEND' && <p className="v-note v-note--warn">{tr('Счёт изменён после передачи — нажмите кнопку, чтобы обновить кассу.')}</p>}
        {onDayHospital && (
          <>
            <button type="button" className="v-btn v-btn--line v-btn--lg v-btn--block" onClick={onDayHospital}><Icon name="bed" size={18} /> {tr('Оформить курс дневного стационара')}</button>
            <p className="v-muted v-small v-center">{tr('Данные пациента и диагноз перенесутся в курс автоматически')}</p>
          </>
        )}
      </Card>
    </div>
  );
}
