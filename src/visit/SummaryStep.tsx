import { useState } from 'react';
import { addService, cartTotals, encounter, flushSave, setServiceQty, toast, ui, useEnc } from '../state';
import { syncBilling } from '../lib/api';
import { rxDrugs } from '../lib/documents';
import { searchPrice } from '../data/priceList';
import { dateRu, plural, rub } from '../lib/format';
import { SEVERITIES, STAGES } from '../components/center/SectionA';
import { Icon } from '../components/ui/Icon';
import type { DocsSelection } from '../types';
import { Card } from './ui';

function DocRow({ on, disabled, title, sub, onChange }: { on: boolean; disabled?: boolean; title: string; sub: string; onChange: (v: boolean) => void }) {
  return (
    <label className={`v-doc${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`v-box${on ? ' is-on' : ''}`} aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
      <span className="v-doc__text"><strong>{title}</strong><span className="v-muted">{sub}</span></span>
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
  const sev = SEVERITIES.find((x) => x.value === dx.severity)?.label.toLowerCase();
  const stage = STAGES.find((x) => x.value === dx.stage)?.label.toLowerCase();
  const results = searchPrice(q, 5);
  const billing = s.billing;

  const finish = async () => {
    setSending(true);
    try {
      await flushSave();
      if (billing.status !== 'SENT_TO_CASHIER' && billing.status !== 'PAID') {
        await syncBilling(s.encounterId, billing.status !== 'DRAFT');
        encounter.set((d) => { d.billing.status = 'SENT_TO_CASHIER'; d.billing.sentAt = new Date().toISOString(); });
        toast(`Счёт передан на кассу · ${rub(totals.renderedFinal)}`, 'success');
      }
      ui.set((u) => { u.docsModalOpen = true; });
    } catch (e) {
      toast(`Касса недоступна: ${(e as Error).message}`, 'danger');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="v-grid v-grid--side">
      <div className="v-stack">
        <Card title="Итог приёма" aside="проверьте перед завершением">
          <dl className="v-summary">
            <dt>Диагноз</dt>
            <dd>{dx.icd10Code ? `${dx.icd10Code} ${dx.icd10Name}${sev ? `, ${sev} тяжести` : ''}${stage ? `, ${stage} стадия` : ''}` : <span className="v-danger">не указан — вернитесь к шагу «Диагноз»</span>}</dd>
            <dt>Осмотр</dt>
            <dd>{s.markers.length} {plural(s.markers.length, 'очаг', 'очага', 'очагов')}{calcs.length ? ` · ${calcs.join(' · ')}` : ''}</dd>
            <dt>Назначения</dt>
            <dd>{nDrugs} {plural(nDrugs, 'препарат', 'препарата', 'препаратов')}{planned.length ? ` · ${planned.length} ${plural(planned.length, 'обследование', 'обследования', 'обследований')}` : ''}{P.skincareRoutine.length ? ` · уход: ${P.skincareRoutine.length}` : ''}</dd>
            <dt>Повторно</dt>
            <dd>{P.followUpDays ? `${dateRu(Date.now() + P.followUpDays * 86400000)} (через ${P.followUpDays} дн.)` : 'не назначено'}</dd>
          </dl>
          <h2 className="v-card__title">Документы</h2>
          <div className="v-stack v-stack--tight">
            <DocRow on={s.docs.summary} title="Заключение врача" sub="PDF и ссылка для пациента" onChange={(v) => setDoc('summary', v)} />
            {s.docs.summary && <DocRow on={s.docs.attachDermatoscopy} title="Приложить снимки дерматоскопии" sub="к заключению" onChange={(v) => setDoc('attachDermatoscopy', v)} />}
            <DocRow on={s.docs.prescriptions && hasRx} disabled={!hasRx} title="Рецепт" sub={hasRx ? 'форма 107-1/у и прописи' : 'нет рецептурных препаратов'} onChange={(v) => setDoc('prescriptions', v)} />
            <DocRow on={s.docs.memo} title="Памятка по уходу" sub="схема применения по времени суток" onChange={(v) => setDoc('memo', v)} />
            <DocRow on={s.docs.estimate} title="Смета рекомендованных услуг" sub="обследования по плану" onChange={(v) => setDoc('estimate', v)} />
          </div>
          <p className="v-muted v-small">ИДС на электронные каналы: {s.patient.communicationConsent ? <span className="v-ok">подписано</span> : <span className="v-danger">не подписано</span>}</p>
        </Card>
      </div>

      <Card title="Оплата" className="v-card--side">
        <ul className="v-pay">
          {today.map((i) => (
            <li key={i.id}>
              <span>{i.name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
              <strong className="mono">{rub(i.unitPrice * i.quantity)}</strong>
              <button type="button" className="v-icon v-icon--sm" aria-label={`Убрать: ${i.name}`} onClick={() => setServiceQty(i.id, 0)}><Icon name="x" size={14} /></button>
            </li>
          ))}
          {!today.length && <li className="v-muted">Услуг за сегодня нет</li>}
        </ul>
        <div className="v-combo">
          <div className="combo">
            <span className="combo__icon"><Icon name="plus" size={16} /></span>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Услуга из прайса" aria-label="Услуга из прайса" />
            {results.length > 0 && (
              <div className="combo__list">
                {results.map((r) => (
                  <button key={r.code} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); addService(r, 'RENDERED'); setQ(''); }}>
                    {r.name} <span className="combo__price mono">{rub(r.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {billing.discountPercent > 0 && <p className="v-muted">Скидка {billing.discountPercent}%</p>}
        <div className="v-total"><span>К оплате</span><strong className="mono">{rub(totals.renderedFinal)}</strong></div>
        {totals.prescribedFinal > 0 && <p className="v-muted v-small">Рекомендовано по плану: {rub(totals.prescribedFinal)}</p>}
        <button type="button" className="v-btn v-btn--ink v-btn--lg v-btn--block" disabled={sending} onClick={() => void finish()}>
          {sending ? 'Передача…' : billing.status === 'PAID' ? 'Оплачено · документы' : billing.status === 'SENT_TO_CASHIER' ? 'На кассе · сформировать документы' : 'Завершить и передать на кассу'}
        </button>
        {billing.status === 'UPDATED_AFTER_SEND' && <p className="v-note v-note--warn">Счёт изменён после передачи — нажмите кнопку, чтобы обновить кассу.</p>}
        {onDayHospital && (
          <>
            <button type="button" className="v-btn v-btn--line v-btn--lg v-btn--block" onClick={onDayHospital}><Icon name="bed" size={18} /> Оформить курс дневного стационара</button>
            <p className="v-muted v-small v-center">Данные пациента и диагноз перенесутся в курс автоматически</p>
          </>
        )}
      </Card>
    </div>
  );
}
