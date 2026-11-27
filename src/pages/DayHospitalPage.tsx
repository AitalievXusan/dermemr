import { useEffect, useState } from 'react';
import { createDayCourse, fetchQueue, listDayCourses, server, type QueueItem } from '../lib/api';
import { navigate } from '../lib/router';
import { toast } from '../state';
import { COURSE_DAYS, courseDay, ddmmyyyy, type DayCourse } from '../data/dayHospital';
import { Icon } from '../components/ui/Icon';
import { TopBar } from './QueuePage';
import { ageText, getLang, tr } from '../lib/i18n';
import { lastCourseSave } from './DayCoursePage';

const DOCTOR_KEY = 'dermemr-dh-doctor';
export const lastDoctor = () => {
  try {
    return localStorage.getItem(DOCTOR_KEY) ?? '';
  } catch {
    return '';
  }
};
export const rememberDoctor = (name: string) => {
  try {
    if (name.trim()) localStorage.setItem(DOCTOR_KEY, name.trim());
  } catch { /* ignore */ }
};

/** Создать курс (новый пациент или из амбулаторного приёма) и открыть его. */
let creating = false; // повторное нажатие, пока сервер отвечает, не создаёт второй пустой курс
export async function startDayCourse(fromEncounterId?: string) {
  if (creating) return;
  creating = true;
  try {
    const c = await createDayCourse({ fromEncounterId, doctor: lastDoctor() || undefined, lang: getLang() });
    navigate(`/day-hospital/${c.id}`);
  } catch (e) {
    toast(`${tr('Не удалось создать курс')}: ${(e as Error).message}`, 'danger');
  } finally {
    creating = false;
  }
}

function Progress({ c }: { c: DayCourse }) {
  if (c.status === 'DONE') return <span className="dh-badge dh-badge--done">{tr('Завершён')}</span>;
  const d = courseDay(c.startDate);
  if (d === 0) return <span className="dh-badge">{tr('с {date}', { date: ddmmyyyy(c.startDate) })}</span>;
  if (d > COURSE_DAYS) return <span className="dh-badge dh-badge--warn">{tr('10 дней прошли')}</span>;
  return (
    <span className="dh-progress" title={tr('День {d} из {n}', { d, n: COURSE_DAYS })}>
      <span className="dh-progress__bar"><span style={{ width: `${(d / COURSE_DAYS) * 100}%` }} /></span>
      <span className="mono">{d}/{COURSE_DAYS}</span>
    </span>
  );
}

export function DayHospitalPage() {
  const [items, setItems] = useState<DayCourse[] | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // какой курс сейчас создаётся
  const start = async (key: string, fromEncounterId?: string) => {
    setBusy(key);
    await startDayCourse(fromEncounterId);
    setBusy(null);
  };

  useEffect(() => {
    // если только что вернулись из курса, сначала дожидаемся его сохранения
    void lastCourseSave.then(() => listDayCourses()).then(setItems).catch(() => setItems([]));
    if (server.online) fetchQueue().then(setQueue).catch(() => setQueue([]));
  }, []);

  const active = (items ?? []).filter((c) => c.status === 'ACTIVE');
  const done = (items ?? []).filter((c) => c.status === 'DONE');
  const linked = new Set(active.map((c) => c.encounterId).filter(Boolean));
  const fromVisit = queue.filter((q) => !linked.has(q.id));

  return (
    <div className="page">
      <TopBar title={tr('Дневной стационар')} />
      <div className="page__body dh-page">
        <div className="dh-head">
          <div>
            <h1 className="dh-title">{tr('Дневной стационар')}</h1>
            <p className="muted">{tr('Курсы лечения по 10 дней (без воскресений) с листом назначений для печати на русском и узбекском.')}</p>
          </div>
          <button type="button" className="btn btn--accent btn--tall" disabled={!!busy} onClick={() => void start('new')}>
            <Icon name="plus" /> {busy === 'new' ? tr('Создаю курс…') : tr('Новый пациент')}
          </button>
        </div>

        <section className="card">
          <h2 className="card__title">{tr('На курсе')} · {active.length}</h2>
          {items === null ? (
            <p className="muted mono">{tr('Загрузка…')}</p>
          ) : active.length === 0 ? (
            <p className="muted">{tr('Активных курсов нет. Оформите курс для нового пациента или переведите пациента из сегодняшнего приёма.')}</p>
          ) : (
            <table className="dh-table">
              <thead>
                <tr><th>{tr('Пациент')}</th><th>{tr('Диагноз')}</th><th>{tr('Начало')}</th><th>{tr('День курса')}</th><th>{tr('Врач')}</th><th aria-label={tr('Действия')} /></tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/day-hospital/${c.id}`)}>
                    <td><strong>{c.fio || tr('Без имени')}</strong>{c.birthYear && <span className="muted"> · {c.birthYear}</span>}{c.encounterId && <span className="dh-badge dh-badge--link" title={tr('Создан из амбулаторного приёма')}><Icon name="link" size={12} /> {tr('приём')}</span>}</td>
                    <td>{c.diagnosis || <span className="muted">—</span>}</td>
                    <td className="mono">{ddmmyyyy(c.startDate)}</td>
                    <td><Progress c={c} /></td>
                    <td>{c.doctor || <span className="muted">—</span>}</td>
                    <td className="dh-table__go"><Icon name="arrowRight" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {server.online && (
          <section className="card">
            <h2 className="card__title">{tr('Перевести из сегодняшнего приёма')}</h2>
            <p className="muted">{tr('ФИО, год рождения, телефон и диагноз перейдут в курс автоматически; шаблон подберётся по коду МКБ-10.')}</p>
            {fromVisit.length === 0 ? (
              <p className="muted">{tr('Сегодня нет приёмов без оформленного курса.')}</p>
            ) : (
              <ul className="dh-visits">
                {fromVisit.map((q) => (
                  <li key={q.id}>
                    <span><strong>{q.patient.fullName}</strong> <span className="muted">· {ageText(q.patient.age)}</span></span>
                    <span className="muted">{q.diagnosis || tr('диагноз не указан')}</span>
                    <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => void start(q.id, q.id)}>
                      <Icon name="bed" /> {busy === q.id ? tr('Создаю курс…') : tr('Оформить курс')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {done.length > 0 && (
          <section className="card">
            <button type="button" className="link dh-toggle" onClick={() => setShowDone((v) => !v)}>
              {showDone ? '▾' : '▸'} {tr('Завершённые курсы')} · {done.length}
            </button>
            {showDone && (
              <ul className="dh-visits">
                {done.map((c) => (
                  <li key={c.id}>
                    <span><strong>{c.fio || tr('Без имени')}</strong></span>
                    <span className="muted">{c.diagnosis} · {tr('с {date}', { date: ddmmyyyy(c.startDate) })}</span>
                    <a className="btn btn--ghost" href={`#/day-hospital/${c.id}`}>{tr('Открыть')}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
