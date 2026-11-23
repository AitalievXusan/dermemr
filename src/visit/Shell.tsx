import { useEffect, useState, type ReactNode } from 'react';
import { encounter, useEnc } from '../state';
import { server, setEncounterStatus } from '../lib/api';
import { formatAge } from '../lib/calculators';
import { mmss, timeHHMM } from '../lib/format';
import { ageText } from '../lib/i18n';
import { LangSwitch } from '../components/ui/Flags';
import { Icon } from '../components/ui/Icon';
import { Timeline } from '../components/left/Timeline';
import { BeforeAfter } from '../components/left/BeforeAfter';
import { Calculators } from '../components/left/Calculators';
import { tr } from '../lib/i18n';

export const STEP_TITLES = ['Жалобы', 'Осмотр', 'Диагноз', 'Лечение', 'Итог'] as const;

function Clock() {
  const startedAt = useEnc((s) => s.startedAt);
  const status = useEnc((s) => s.status);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status !== 'IN_PROGRESS') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);
  return (
    <span className="v-top__clock mono" title={tr('Длительность приёма')}>
      <Icon name="clock" size={18} /> {status === 'WAITING' ? '00:00' : now - startedAt > 12 * 3600_000 ? tr('с {time}', { time: timeHHMM(startedAt) }) : mmss(now - startedAt)}
    </span>
  );
}

/** Шапка приёма: пациент, предохранители (аллергия, беременность), таймер, история и фото. */
export function VisitTopbar({ onHistory }: { onHistory: () => void }) {
  const p = useEnc((s) => s.patient);
  const type = useEnc((s) => s.appointmentType);
  return (
    <header className="v-top">
      {server.online && (
        <a className="v-btn v-btn--soft" href="#/"><Icon name="arrowLeft" size={18} /> {tr('Очередь')}</a>
      )}
      <div className="v-top__who">
        <h1 className="v-top__name">{p.fullName}</h1>
        <span className="v-top__meta">
          {tr(p.sex === 'F' ? tr('Ж') : tr('М'))} · {ageText(formatAge(p.birthDate))} · {tr(type === 'PRIMARY' ? tr('первичный приём') : type === 'TELEMEDICINE' ? tr('телемедицина') : tr('повторный приём'))}
        </span>
      </div>
      <div className="v-top__alerts">
        {p.allergies.length > 0 && <span className="v-alert"><Icon name="alert" size={18} /> <span className="v-alert__txt" title={p.allergies.join(', ')}>{tr('Аллергия')}: {p.allergies.join(', ').toLowerCase()}</span></span>}
        {p.isPregnantOrLactating && <span className="v-alert"><Icon name="alert" size={18} /> <span className="v-alert__txt">{tr('Беременность / лактация')}</span></span>}
        {p.activeRetinoids && <span className="v-alert v-alert--warn" title={tr('Текущий приём системных ретиноидов: контроль биохимии и теста на беременность')}><span className="v-alert__txt">{tr('Ретиноиды: АЛТ / ХГЧ')}</span></span>}
      </div>
      <Clock />
      <LangSwitch compact />
      <button type="button" className="v-btn v-btn--line v-top__hist" onClick={onHistory} title={tr('История и фото')}><Icon name="columns" size={18} /> <span>{tr('История и фото')}</span></button>
    </header>
  );
}

export function VisitStepper({ active, done, onPick }: { active: number; done: boolean[]; onPick: (i: number) => void }) {
  return (
    <nav className="v-steps" aria-label={tr('Шаги приёма')}>
      {STEP_TITLES.map((t, i) => {
        const isDone = i !== active && done[i];
        return (
          <button key={t} type="button" className={`v-steps__item${i === active ? ' is-active' : ''}${isDone ? ' is-done' : ''}`} aria-current={i === active ? 'step' : undefined} onClick={() => onPick(i)}>
            <span className="v-steps__head">
              <span className="v-steps__dot">{isDone ? <Icon name="check" size={16} /> : i + 1}</span>
              <span className="v-steps__title">{tr(t)}</span>
            </span>
            <span className="v-steps__bar" />
          </button>
        );
      })}
    </nav>
  );
}

function Saved() {
  const saveState = useEnc((s) => s.saveState);
  const savedAt = useEnc((s) => s.savedAt);
  const text = {
    saved: savedAt ? tr('Сохранено в {time}', { time: timeHHMM(savedAt) }) : tr('Черновик'),
    pending: tr('Изменения…'),
    saving: tr('Сохранение…'),
    offline: tr('Офлайн: сохраняется на этом компьютере'),
    conflict: tr('Конфликт версий — обновите карту'),
  }[saveState];
  return <span className={`v-foot__saved is-${saveState}`} aria-live="polite"><Icon name="check" size={16} /> {text}</span>;
}

export function VisitFooter({ step, onStep, onFinish, extra }: { step: number; onStep: (i: number) => void; onFinish: () => void; extra?: ReactNode }) {
  return (
    <footer className="v-foot">
      <Saved />
      {extra}
      <span className="v-foot__spacer" />
      {step > 0 && (
        <button type="button" className="v-btn v-btn--line v-btn--lg" onClick={() => onStep(step - 1)}>
          <Icon name="arrowLeft" size={18} /> {tr(STEP_TITLES[step - 1])}
        </button>
      )}
      {step < STEP_TITLES.length - 1 ? (
        <button type="button" className="v-btn v-btn--ink v-btn--lg" onClick={() => onStep(step + 1)}>
          {tr('Далее: {step}', { step: tr(STEP_TITLES[step + 1]) })} <Icon name="arrowRight" size={18} />
        </button>
      ) : (
        <button type="button" className="v-btn v-btn--ink v-btn--lg" onClick={onFinish}>
          {tr('Сформировать документы')} <Icon name="arrowRight" size={18} />
        </button>
      )}
    </footer>
  );
}

/** Боковая панель: лента визитов и анализов, сравнение фото «до / после», загрузка снимков. */
export function HistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="v-drawer" role="dialog" aria-label={tr('История и фото')}>
      <button type="button" className="v-drawer__scrim" aria-label={tr('Закрыть')} onClick={onClose} />
      <aside className="v-drawer__panel">
        <div className="v-drawer__head">
          <h2 className="v-card__title">{tr('История и фото')}</h2>
          <button type="button" className="v-btn v-btn--soft" onClick={onClose}><Icon name="x" size={18} /> {tr('Закрыть')}</button>
        </div>
        <BeforeAfter />
        <Timeline />
      </aside>
    </div>
  );
}

/** Калькуляторы индексов (PASI, SCORAD, EASI, GAGS, DLQI, UAS7) поверх страницы. */
export function CalcModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="v-modal" role="dialog" aria-label={tr('Индексы тяжести')}>
      <button type="button" className="v-drawer__scrim" aria-label={tr('Закрыть')} onClick={onClose} />
      <div className="v-modal__panel">
        <div className="v-drawer__head">
          <h2 className="v-card__title">{tr('Индексы тяжести')}</h2>
          <button type="button" className="v-btn v-btn--soft" onClick={onClose}><Icon name="x" size={18} /> {tr('Готово')}</button>
        </div>
        <Calculators />
        <p className="v-muted">{tr('«Вставить в диагноз» сохраняет индекс в карте; степень тяжести подставится автоматически.')}</p>
      </div>
    </div>
  );
}

/** Открытие карты из очереди начинает приём: статус «На приёме», запуск таймера. */
export function useAutoStart(id: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const s = encounter.get();
    if (s.encounterId !== id || s.status !== 'WAITING') return;
    encounter.set((d) => { d.status = 'IN_PROGRESS'; d.startedAt = Date.now(); });
    if (server.online) void setEncounterStatus(id, 'IN_PROGRESS').then((r) => encounter.set((d) => { if (r.startedAt) d.startedAt = r.startedAt; })).catch(() => undefined);
  }, [id, ready]);
}
