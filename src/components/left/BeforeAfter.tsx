import { useEffect, useRef, useState } from 'react';
import { encounter, flushSave, refreshMedia, toast, ui, useEnc, useUi } from '../../state';
import { createQrSession, patchMedia, server, uploadMedia } from '../../lib/api';
import { dateRu } from '../../lib/format';
import { Icon } from '../ui/Icon';
import { addUpload, media, useMedia } from './media';
import { tr } from '../../lib/i18n';

/** Шторка сравнения «До / После» в калиброванной нейтральной рамке (DESIGN §1.1 п.5, §5.2 Б). */
export function BeforeAfter() {
  const markers = useEnc((s) => s.markers);
  const items = useMedia((s) => s.items);
  const selected = useMedia((s) => s.selectedMarker);
  const lightbox = useUi((s) => s.lightbox);
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const forMarker = items.filter((i) => i.markerId === selected).sort((a, b) => a.date.localeCompare(b.date));
  const after = forMarker[forMarker.length - 1];
  const before = forMarker.length > 1 ? forMarker[forMarker.length - 2] : undefined;

  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!lightbox) return;
    panelRef.current?.scrollIntoView({ block: 'start' });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.set((u) => { u.lightbox = false; });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const move = (clientX: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  const marker = markers.find((m) => m.id === selected);

  return (
    <section ref={panelRef} className={`panel${lightbox ? ' panel--lightbox' : ''}`} aria-label={tr('Сравнение До / После')}>
      <div className="panel__head">
        <h2 className="panel__title">{tr('До / После')}</h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => fileRef.current?.click()} title={tr('Загрузить снимок с ПК или дерматоскопа')}>
            <Icon name="upload" size={14} /> {tr('Фото')}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            title={server.online ? tr('Загрузка со смартфона по QR-коду') : tr('Доступно при запуске с сервером (npm start)')}
            disabled={!server.online}
            onClick={async () => {
              await flushSave(); // маркеры должны быть на сервере, чтобы телефон их видел
              const s = await createQrSession(encounter.get().encounterId);
              ui.set((u) => { u.qr = { url: s.url, svg: s.svg, expiresAt: s.expiresAt }; });
            }}
          >
            <Icon name="qr" size={14} /> QR
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => ui.set((u) => { u.lightbox = !u.lightbox; })}
            aria-label={lightbox ? tr('Свернуть') : tr('Развернуть')}
          >
            <Icon name={lightbox ? 'x' : 'maximize'} size={14} />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!server.online) return addUpload(f, selected);
            void uploadMedia(encounter.get().encounterId, f, selected)
              .then(() => refreshMedia())
              .catch((err: Error) => toast(`${tr('Не удалось загрузить снимок')}: ${err.message}`, 'danger'));
          }}
        />
      </div>

      <select
        className="select select--xs"
        value={selected ?? ''}
        onChange={(e) => media.set((m) => { m.selectedMarker = e.target.value || null; })}
        aria-label={tr('Очаг для сравнения')}
      >
        {markers.map((m) => (
          <option key={m.id} value={m.id}>#{m.number} {m.anatomyLabel}</option>
        ))}
      </select>

      <div
        ref={frameRef}
        className="compare"
        onDoubleClick={() => ui.set((u) => { u.lightbox = !u.lightbox; })}
        onPointerDown={(e) => {
          if (!before) return;
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
      >
        {after ? (
          <>
            <img className="compare__img" src={after.url} alt={`${tr('Снимок')} ${dateRu(after.date)}`} draggable={false} />
            {before && (
              <>
                <img
                  className="compare__img compare__img--before"
                  src={before.url}
                  alt={`${tr('Снимок')} ${dateRu(before.date)}`}
                  style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                  draggable={false}
                />
                <div className="compare__line" style={{ left: `${pos}%` }}>
                  <span className="compare__knob" />
                </div>
                <span className="compare__tag compare__tag--l mono">{dateRu(before.date)}</span>
              </>
            )}
            <span className="compare__tag compare__tag--r mono">{dateRu(after.date)}</span>
          </>
        ) : (
          <div className="compare__empty">
            <Icon name="image" />
            <span>{tr('Нет снимков для')} {marker ? `#${marker.number}` : tr('очага')}</span>
          </div>
        )}
      </div>
      {after && (
        <label className="check check--sm">
          <input
            type="checkbox"
            checked={after.includeInPdf}
            onChange={(e) => {
              const v = e.target.checked;
              media.set((m) => { const it = m.items.find((x) => x.id === after.id); if (it) it.includeInPdf = v; });
              if (server.online) void patchMedia(after.id, { includeInPdf: v });
            }}
          />
          <span className="check__box" aria-hidden="true" />
          <span>{tr('Включить снимок {date} в PDF', { date: dateRu(after.date) })}</span>
        </label>
      )}
      {lightbox && <p className="panel__hint">{tr('Esc — закрыть. Протокол SOAP остается доступным для ввода.')}</p>}
    </section>
  );
}
