import { useEffect, useRef, useState } from 'react';
import { encounter, flushSave, markConsentSigned, toast, ui, useEnc, useUi } from '../../state';
import { completeEncounter, dispatchDocuments, generateDocuments, server, validateCompletion, type GenerateResult } from '../../lib/api';
import { Segmented } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { DocFrame, type DocFrameHandle } from './DocFrame';
import { EstimateA4, ExtemporalRxA4, MemoA4, PrescriptionsA4, SummaryA4, SummaryMobile } from './Documents';
import { useMedia } from '../left/media';
import { rxDrugs } from '../../lib/documents';
import type { Channel, DeliveryStatus } from '../../types';
import { tr } from '../../lib/i18n';

const CHANNELS: { id: Channel; label: string; icon: IconName }[] = [
  { id: 'PATIENT_PORTAL', label: 'Личный кабинет', icon: 'user' },
  { id: 'TELEGRAM', label: 'Telegram', icon: 'send' },
  { id: 'WHATSAPP', label: 'WhatsApp', icon: 'message' },
  { id: 'MAX', label: 'MAX', icon: 'message' },
];

const STATUS_TEXT: Record<DeliveryStatus, string> = {
  IDLE: '', QUEUED: 'В очереди', SENT: 'Отправлено', DELIVERED: 'Доставлено', READ: 'Прочитано', FAILED: 'Ошибка',
};
const STATUS_ICON: Partial<Record<DeliveryStatus, IconName>> = {
  QUEUED: 'clock', SENT: 'check', DELIVERED: 'checkCheck', READ: 'checkCheck', FAILED: 'alert',
};

const A4_PX = 794; // 210 мм при 96 DPI
const MOBILE_PX = 520; // 390 pt

export function DocumentsModal() {
  const state = useEnc((s) => s);
  const photos = useMedia((s) => s.items).filter((m) => m.includeInPdf && (!m.encounterId || m.encounterId === state.encounterId));
  const deliveryErrors = useUi((s) => s.deliveryErrors);
  const [view, setView] = useState<'A4' | 'MOBILE'>('A4');
  const [generating, setGenerating] = useState(true);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [rejected, setRejected] = useState<Partial<Record<Channel, string>>>({});
  const frame = useRef<DocFrameHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const errors = [...new Set([...validateCompletion(state), ...serverErrors])];
  const consent = state.patient.communicationConsent;
  const hasRx = state.docs.prescriptions && rxDrugs(state).length > 0;
  const hasExt = state.docs.prescriptions && state.soap.plan.extemporalPrescriptions.length > 0;
  const verifyBase = server.config?.publicUrl ?? window.location.origin;
  const modes = server.config?.channels;

  useEffect(() => { previewRef.current?.scrollTo({ top: 0 }); }, [view]);

  useEffect(() => {
    let alive = true;
    // POST /documents/generate — PDF A4 + Mobile на сервере (Headless Chromium)
    (async () => {
      if (!server.online) {
        await new Promise((r) => setTimeout(r, 450));
        if (alive) setGenerating(false);
        return;
      }
      try {
        await flushSave();
        const r = await generateDocuments(encounter.get().encounterId);
        if (!alive) return;
        setResult(r);
        encounter.set((s) => { s.documents = r.documents; });
      } catch (e) {
        if (alive) setGenError((e as Error).message);
      } finally {
        if (alive) setGenerating(false);
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, []);

  const close = () => ui.set((u) => { u.docsModalOpen = false; });

  const serverDoc = (type: 'SUMMARY_DESKTOP_A4' | 'SUMMARY_MOBILE') => result?.documents.find((d) => d.docType === type);

  const download = () => {
    const d = serverDoc(view === 'A4' ? 'SUMMARY_DESKTOP_A4' : 'SUMMARY_MOBILE');
    if (d) window.open(d.url, '_blank', 'noopener');
    else frame.current?.print();
  };

  const send = async (ch: Channel) => {
    setRejected((r) => ({ ...r, [ch]: undefined }));
    const label = CHANNELS.find((c) => c.id === ch)!.label;
    try {
      const res = await dispatchDocuments(state.encounterId, [ch], result?.documents.map((d) => d.id) ?? [], (c, st) => {
        encounter.set((s) => { s.delivery[c] = st; });
        if (st === 'SENT') toast(`${tr('Документы отправлены')} · ${tr(label)}`, 'success');
      });
      const rej = res.rejected.find((r) => r.channel === ch);
      if (rej) setRejected((r) => ({ ...r, [ch]: rej.reason }));
      else {
        if (server.online) toast(`${tr('Документы поставлены в очередь')} · ${tr(label)}`, 'success');
        encounter.set((s) => { if (s.status === 'IN_PROGRESS' && !validateCompletion(s).length) s.status = 'COMPLETED'; });
      }
    } catch (e) {
      toast(`${tr('Не удалось отправить')}: ${(e as Error).message}`, 'danger');
    }
  };

  const complete = async () => {
    const errs = await completeEncounter(state.encounterId, state);
    setServerErrors(errs);
    if (errs.length) return;
    encounter.set((s) => { s.status = 'COMPLETED'; });
    toast(tr('Прием завершен, протокол подписан'), 'success');
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={tr('Предпросмотр и отправка документов')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal__head">
          <h2 className="modal__title">{tr('Документы на выход')}</h2>
          {result && (
            <span className="modal__engine mono" title={tr('Серверная генерация PDF')}>
              {result.engine === 'chromium' ? `PDF · ${result.documents.length} ${tr('файлов')} · ${(result.ms / 1000).toFixed(1)} ${tr('с')}` : tr('HTML для печати (браузер для PDF не найден)')}
            </span>
          )}
          <Segmented
            options={[{ value: 'A4', label: 'ПК версия (A4)' }, { value: 'MOBILE', label: 'Мобильная версия' }]}
            value={view}
            onChange={setView}
          />
          <button type="button" className="icon-btn" onClick={close} aria-label={tr('Закрыть')}><Icon name="x" /></button>
        </div>

        {errors.length > 0 && (
          <div className="modal__errors" role="alert">
            <Icon name="alert" size={14} /> {tr('Для завершения приема')}: {errors.join('; ')}.
          </div>
        )}
        {genError && (
          <div className="modal__errors" role="alert">
            <Icon name="alert" size={14} /> {tr('Сервер не сформировал PDF')}: {genError}. {tr('Доступна печать из браузера.')}
          </div>
        )}

        <div ref={previewRef} className={`modal__preview${view === 'MOBILE' ? ' is-mobile' : ''}`}>
          {generating ? (
            <div className="modal__loading mono">{tr('Генерация пакета…')}</div>
          ) : view === 'A4' ? (
            <DocFrame ref={frame} widthPx={A4_PX} pageCss="size:A4;margin:0" title={tr('Заключение_A4')}>
              {state.docs.summary && <SummaryA4 state={state} photos={photos} verifyBase={verifyBase} />}
              {hasRx && <PrescriptionsA4 state={state} verifyBase={verifyBase} />}
              {hasExt && <ExtemporalRxA4 state={state} verifyBase={verifyBase} />}
              {state.docs.memo && <MemoA4 state={state} verifyBase={verifyBase} />}
              {state.docs.estimate && <EstimateA4 state={state} verifyBase={verifyBase} />}
            </DocFrame>
          ) : (
            <DocFrame ref={frame} widthPx={MOBILE_PX} pageCss="size:137.5mm 297mm;margin:0" title={tr('Заключение_Mobile')}>
              <SummaryMobile state={state} verifyBase={verifyBase} />
            </DocFrame>
          )}
        </div>

        <div className="modal__foot">
          <div className="modal__downloads">
            <button type="button" className="btn btn--outline btn--sm" onClick={download} disabled={generating}>
              <Icon name="download" /> {view === 'A4' ? tr('Скачать PDF (A4)') : tr('Скачать Mobile PDF')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => frame.current?.print()} disabled={generating || view !== 'A4'}>
              <Icon name="printer" /> {tr('Печать')}
            </button>
            {result && result.documents.length > 2 && (
              <span className="modal__more">
                {result.documents.filter((d) => !d.docType.startsWith('SUMMARY')).map((d) => (
                  <a key={d.id} className="link" href={d.url} target="_blank" rel="noreferrer">
                    {tr({ PRESCRIPTION_107: 'Рецепты', EXTEMPORAL_RX: 'Прописи', PATIENT_MEMO: 'Памятка', ESTIMATE: 'Смета' }[d.docType as string] ?? '')}
                  </a>
                ))}
              </span>
            )}
            <button type="button" className="btn btn--instrument btn--sm" onClick={complete} disabled={errors.length > 0 || state.status === 'COMPLETED' || state.status === 'SIGNED'}>
              {state.status === 'COMPLETED' || state.status === 'SIGNED' ? tr('Прием завершен ✓') : tr('Завершить прием')}
            </button>
          </div>

          <div className="channels">
            {consent ? (
              <span className="consent is-ok">{tr('ИДС на передачу по каналам связи подписано')}</span>
            ) : (
              <span className="consent">
                {tr('Необходимо подписать согласие на ресепшене')}{' '}
                <button type="button" className="link" onClick={() => void markConsentSigned()}>{tr('Отметить подписанным')}</button>
              </span>
            )}
            <div className="channels__row">
              {CHANNELS.map((c) => {
                const st = state.delivery[c.id];
                const disabled = generating || errors.length > 0 || (c.id !== 'PATIENT_PORTAL' && !consent) || (st !== 'IDLE' && st !== 'FAILED');
                return (
                  <div key={c.id} className="channel">
                    <button type="button" className="btn btn--outline btn--sm channel__btn" disabled={disabled} onClick={() => send(c.id)}>
                      <Icon name={c.icon} /> {tr(c.label)}
                    </button>
                    {modes?.[c.id] === 'simulation' && st === 'IDLE' && <span className="channel__mode" title={tr('Токен канала не задан в .env — статусы симулируются')}>{tr('демо')}</span>}
                    {st !== 'IDLE' && (
                      <span className={`channel__status is-${st.toLowerCase()}`}>
                        {STATUS_ICON[st] && <Icon name={STATUS_ICON[st]!} size={14} />} {tr(STATUS_TEXT[st])}
                        {st === 'FAILED' && <button type="button" className="link" onClick={() => send(c.id)}>{tr('Повторить')}</button>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {(Object.entries({ ...deliveryErrors, ...rejected }) as [Channel, string | undefined][]).filter(([, v]) => v).map(([ch, msg]) => (
            <p key={ch} className="channel__error">
              <strong>{tr(CHANNELS.find((c) => c.id === ch)?.label ?? '')}:</strong> {msg}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
