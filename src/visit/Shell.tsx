import { useEffect, useState, type ReactNode } from 'react';
import { encounter, useEnc } from '../state';
import { server, setEncounterStatus } from '../lib/api';
import { formatAge } from '../lib/calculators';
import { mmss, timeHHMM } from '../lib/format';
import { Icon } from '../components/ui/Icon';
import { Timeline } from '../components/left/Timeline';
import { BeforeAfter } from '../components/left/BeforeAfter';
import { Calculators } from '../components/left/Calculators';

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
    <span className="v-top__clock mono" title="Длительность приёма">
      <Icon name="clock" size={18} /> {status === 'WAITING' ? '00:00' : mmss(now - startedAt)}
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
        <a className="v-btn v-btn--soft" href="#/"><Icon name="arrowLeft" size={18} /> Очередь</a>
      )}
      <div className="v-top__who">
        <h1 className="v-top__name">{p.fullName}</h1>
        <span className="v-top__meta">
          {p.sex === 'F' ? 'Ж' : 'М'} · {formatAge(p.birthDate)} · {type === 'PRIMARY' ? 'первичный приём' : type === 'TELEMEDICINE' ? 'телемедицина' : 'повторный приём'}
        </span>
      </div>
      <div className="v-top__alerts">
        {p.allergies.length > 0 && <span className="v-alert"><Icon name="alert" size={18} /> Аллергия: {p.allergies.join(', ').toLowerCase()}</span>}
        {p.isPregnantOrLactating && <span className="v-alert"><Icon name="alert" size={18} /> Беременность / лактация</span>}
        {p.activeRetinoids && <span className="v-alert v-alert--warn" title="Текущий приём системных ретиноидов: контроль биохимии и теста на беременность">Ретиноиды: АЛТ / ХГЧ</span>}
      </div>
      <Clock />
      <button type="button" className="v-btn v-btn--line" onClick={onHistory}><Icon name="columns" size={18} /> История и фото</button>
    </header>
  );
}

export function VisitStepper({ active, done, onPick }: { active: number; done: boolean[]; onPick: (i: number) => void }) {
  return (
    <nav className="v-steps" aria-label="Шаги приёма">
      {STEP_TITLES.map((t, i) => {
        const isDone = i !== active && done[i];
        return (
          <button key={t} type="button" className={`v-steps__item${i === active ? ' is-active' : ''}${isDone ? ' is-done' : ''}`} aria-current={i === active ? 'step' : undefined} onClick={() => onPick(i)}>
            <span className="v-steps__head">
              <span className="v-steps__dot">{isDone ? <Icon name="check" size={16} /> : i + 1}</span>
              <span className="v-steps__title">{t}</span>
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
    saved: savedAt ? `Сохранено в ${timeHHMM(savedAt)}` : 'Черновик',
    pending: 'Изменения…',
    saving: 'Сохранение…',
    offline: 'Офлайн: сохраняется на этом компьютере',
    conflict: 'Конфликт версий — обновите карту',
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
          <Icon name="arrowLeft" size={18} /> {STEP_TITLES[step - 1]}
        </button>
      )}
      {step < STEP_TITLES.length - 1 ? (
        <button type="button" className="v-btn v-btn--ink v-btn--lg" onClick={() => onStep(step + 1)}>
          Далее: {STEP_TITLES[step + 1]} <Icon name="arrowRight" size={18} />
        </button>
      ) : (
        <button type="button" className="v-btn v-btn--ink v-btn--lg" onClick={onFinish}>
          Сформировать документы <Icon name="arrowRight" size={18} />
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
    <div className="v-drawer" role="dialog" aria-label="История и фото">
      <button type="button" className="v-drawer__scrim" aria-label="Закрыть" onClick={onClose} />
      <aside className="v-drawer__panel">
        <div className="v-drawer__head">
          <h2 className="v-card__title">История и фото</h2>
          <button type="button" className="v-btn v-btn--soft" onClick={onClose}><Icon name="x" size={18} /> Закрыть</button>
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
    <div className="v-modal" role="dialog" aria-label="Индексы тяжести">
      <button type="button" className="v-drawer__scrim" aria-label="Закрыть" onClick={onClose} />
      <div className="v-modal__panel">
        <div className="v-drawer__head">
          <h2 className="v-card__title">Индексы тяжести</h2>
          <button type="button" className="v-btn v-btn--soft" onClick={onClose}><Icon name="x" size={18} /> Готово</button>
        </div>
        <Calculators />
        <p className="v-muted">«Вставить в диагноз» сохраняет индекс в карте; степень тяжести подставится автоматически.</p>
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
