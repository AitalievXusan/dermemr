import { useEffect, useState, type ReactNode } from 'react';
import { encounter, openEncounter, setTheme, ui, useEnc, useUi } from '../../state';
import { server, setEncounterStatus } from '../../lib/api';
import { formatAge } from '../../lib/calculators';
import { mmss, timeHHMM } from '../../lib/format';
import { Segmented } from '../ui/controls';
import { Icon } from '../ui/Icon';
import type { EncounterStatus, Theme } from '../../types';

function Timer() {
  const startedAt = useEnc((s) => s.startedAt);
  const status = useEnc((s) => s.status);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status !== 'IN_PROGRESS') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);
  return <span className="hdr__timer mono" title="Длительность приема">{status === 'WAITING' ? '00:00' : mmss(now - startedAt)}</span>;
}

function SaveIndicator() {
  const saveState = useEnc((s) => s.saveState);
  const savedAt = useEnc((s) => s.savedAt);
  const text: Record<typeof saveState, ReactNode> = {
    saved: savedAt ? <><span className="hdr__save-word">Сохранено </span>{timeHHMM(savedAt)}</> : 'Черновик',
    pending: 'Изменения…',
    saving: 'Сохранение…',
    offline: 'Офлайн-режим: данные сохраняются локально',
    conflict: 'Конфликт версий — обновите карту',
  };
  if (saveState === 'conflict')
    return (
      <button type="button" className="hdr__save is-conflict link" title="Загрузить актуальную версию с сервера" onClick={() => void openEncounter(encounter.get().encounterId)}>
        {text[saveState]}
      </button>
    );
  return <span className={`hdr__save is-${saveState}`} aria-live="polite">{text[saveState]}</span>;
}

const STATUS_OPTS: { value: EncounterStatus; label: string }[] = [
  { value: 'WAITING', label: 'Ожидает' },
  { value: 'IN_PROGRESS', label: 'На приеме' },
  { value: 'COMPLETED', label: 'Завершен' },
];

export function StickyHeader() {
  const p = useEnc((s) => s.patient);
  const status = useEnc((s) => s.status);
  const theme = useUi((s) => s.theme);

  const setStatus = (v: EncounterStatus) => {
    if (v === 'COMPLETED') {
      ui.set((u) => { u.docsModalOpen = true; });
      return;
    }
    encounter.set((s) => {
      if (v === 'IN_PROGRESS' && s.status === 'WAITING') s.startedAt = Date.now();
      s.status = v;
    });
    void setEncounterStatus(encounter.get().encounterId, v).then((r) => encounter.set((s) => { if (r.startedAt) s.startedAt = r.startedAt; }));
  };
  const encId = useEnc((s) => s.encounterId);

  return (
    <header className="hdr">
      {server.online && (
        <a className="icon-btn hdr__back" href="#/" title="К очереди приема" aria-label="К очереди приема">
          <Icon name="arrowLeft" />
        </a>
      )}
      <div className="hdr__patient">
        <h1 className="hdr__name">{p.fullName}</h1>
        <span className="hdr__meta">
          {p.sex === 'F' ? 'Ж' : 'М'}, {formatAge(p.birthDate)}
        </span>
        <span className="badge-rect" title="Фототип по Фитцпатрику">ФТ {p.fitzpatrick}</span>
        <span className="hdr__card mono" title="Номер амбулаторной карты">{p.cardNumber}</span>
      </div>

      <div className="hdr__alerts" aria-label="Клинические предохранители">
        {p.allergies.length > 0 && <span className="alert-pill" title="Лекарственная аллергия">Аллергия: {p.allergies.join(', ')}</span>}
        {p.isPregnantOrLactating && <span className="alert-pill">Беременность / лактация</span>}
        {p.activeRetinoids && <span className="alert-pill alert-pill--warn" title="Текущий прием системных ретиноидов: контроль биохимии и теста на беременность">Ретиноиды: АЛТ / ХГЧ</span>}
      </div>

      <div className="hdr__controls">
        <SaveIndicator />
        <Segmented size="sm" ariaLabel="Статус визита" options={STATUS_OPTS} value={status === 'SIGNED' ? 'COMPLETED' : status} onChange={setStatus} />
        <Segmented<Theme>
          size="sm"
          ariaLabel="Тема"
          options={[{ value: 'light', label: 'Свет' }, { value: 'dark', label: 'Тьма' }]}
          value={theme}
          onChange={setTheme}
        />
        <Timer />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title="Телемедицинская видеоконсультация (комната Jitsi Meet для этого визита)"
          onClick={() => window.open(`https://meet.jit.si/dermemr-${encId}`, '_blank', 'noopener')}
        >
          <Icon name="video" /> <span className="hdr__video-label">Видео</span>
        </button>
      </div>
    </header>
  );
}
