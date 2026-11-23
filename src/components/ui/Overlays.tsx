import { useEffect, useState } from 'react';
import { ui, updateSoap, useUi } from '../../state';
import { Icon } from './Icon';
import { tr } from '../../lib/i18n';

/** Строгий стоп-экран CDSS (DESIGN §6.2): рамка 2px status-danger-text. */
export function CdssModal() {
  const cdss = useUi((s) => s.cdss);
  if (!cdss) return null;
  const blocking = cdss.alerts.some((a) => a.level === 'BLOCKING_ALERT');
  const close = () => ui.set((u) => { u.cdss = null; });
  const cancel = () => {
    const { list, id } = cdss.target;
    updateSoap((s) => {
      const items = s.plan[list] as { id: string }[];
      const idx = items.findIndex((x) => x.id === id);
      if (idx >= 0) items.splice(idx, 1);
    });
    close();
  };
  return (
    <div className="overlay overlay--stop" role="alertdialog" aria-modal="true" aria-label={tr('Клинический конфликт')}>
      <div className={`stop${blocking ? '' : ' stop--warn'}`}>
        <div className="stop__head">
          <Icon name="alert" />
          <h2>{blocking ? tr('Назначение заблокировано') : tr('Предупреждение CDSS')}</h2>
        </div>
        <p className="stop__drug">{cdss.drugName}</p>
        <ul className="stop__list">
          {cdss.alerts.map((a, i) => (
            <li key={i}><strong>{a.title}.</strong> {a.message}</li>
          ))}
        </ul>
        <div className="stop__actions">
          {blocking ? (
            <>
              <button type="button" className="btn btn--danger" onClick={cancel} autoFocus>{tr('Отменить назначение')}</button>
              <button type="button" className="btn btn--ghost" onClick={close}>{tr('Назначить под ответственность врача')}</button>
            </>
          ) : (
            <button type="button" className="btn btn--outline" onClick={close} autoFocus>{tr('Понятно')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Тосты в правом нижнем углу — только для сетевых операций. */
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.tone === 'success' && <Icon name="check" size={14} />} {t.text}
        </div>
      ))}
    </div>
  );
}

/** QR-мост: смартфон врача открывает ссылку и отправляет снимок прямо в карту (SPEC §3.2). */
export function QrModal() {
  const qr = useUi((s) => s.qr);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [qr]);
  if (!qr) return null;
  const left = Math.max(0, qr.expiresAt - now);
  const close = () => ui.set((u) => { u.qr = null; });
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={tr('Загрузка со смартфона')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="qrbox">
        <div className="panel__head">
          <h2 className="panel__title">{tr('Снимок со смартфона')}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label={tr('Закрыть')}><Icon name="x" /></button>
        </div>
        <div className="qrbox__code" dangerouslySetInnerHTML={{ __html: qr.svg }} />
        <ol className="qrbox__steps">
          <li>{tr('Наведите камеру смартфона на код (телефон в той же Wi-Fi сети, что и этот компьютер).')}</li>
          <li>{tr('Выберите очаг и сделайте снимок — он сразу появится в карте.')}</li>
        </ol>
        <p className="qrbox__url mono">{qr.url.replace(/\?t=.*/, '?t=…')}</p>
        <p className="panel__hint">{left > 0 ? `${tr('Ссылка действует ещё')} ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : tr('Срок действия истек — откройте QR заново')} · {tr('ожидаем снимок…')}</p>
      </div>
    </div>
  );
}
