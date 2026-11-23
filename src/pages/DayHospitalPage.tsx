import { useEffect, useState } from 'react';
import { createDayCourse, fetchQueue, listDayCourses, server, type QueueItem } from '../lib/api';
import { navigate } from '../lib/router';
import { toast } from '../state';
import { COURSE_DAYS, courseDay, ddmmyyyy, type DayCourse } from '../data/dayHospital';
import { Icon } from '../components/ui/Icon';
import { TopBar } from './QueuePage';

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
export async function startDayCourse(fromEncounterId?: string) {
  try {
    const c = await createDayCourse({ fromEncounterId, doctor: lastDoctor() || undefined });
    navigate(`/day-hospital/${c.id}`);
  } catch (e) {
    toast(`Не удалось создать курс: ${(e as Error).message}`, 'danger');
  }
}

function Progress({ c }: { c: DayCourse }) {
  if (c.status === 'DONE') return <span className="dh-badge dh-badge--done">Завершён</span>;
  const d = courseDay(c.startDate);
  if (d === 0) return <span className="dh-badge">с {ddmmyyyy(c.startDate)}</span>;
  if (d > COURSE_DAYS) return <span className="dh-badge dh-badge--warn">10 дней прошли</span>;
  return (
    <span className="dh-progress" title={`День ${d} из ${COURSE_DAYS}`}>
      <span className="dh-progress__bar"><span style={{ width: `${(d / COURSE_DAYS) * 100}%` }} /></span>
      <span className="mono">{d}/{COURSE_DAYS}</span>
    </span>
  );
}

export function DayHospitalPage() {
  const [items, setItems] = useState<DayCourse[] | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    listDayCourses().then(setItems).catch(() => setItems([]));
    if (server.online) fetchQueue().then(setQueue).catch(() => setQueue([]));
  }, []);

  const active = (items ?? []).filter((c) => c.status === 'ACTIVE');
  const done = (items ?? []).filter((c) => c.status === 'DONE');
  const linked = new Set(active.map((c) => c.encounterId).filter(Boolean));
  const fromVisit = queue.filter((q) => !linked.has(q.id));

  return (
    <div className="page">
      <TopBar title="Дневной стационар" />
      <div className="page__body dh-page">
        <div className="dh-head">
          <div>
            <h1 className="dh-title">Дневной стационар</h1>
            <p className="muted">Курсы лечения по 10 дней (без воскресений) с листом назначений для печати на русском и узбекском.</p>
          </div>
          <button type="button" className="btn btn--accent btn--tall" onClick={() => void startDayCourse()}>
            <Icon name="plus" /> Новый пациент
          </button>
        </div>

        <section className="card">
          <h2 className="card__title">На курсе · {active.length}</h2>
          {items === null ? (
            <p className="muted mono">Загрузка…</p>
          ) : active.length === 0 ? (
            <p className="muted">Активных курсов нет. Оформите курс для нового пациента или переведите пациента из сегодняшнего приёма.</p>
          ) : (
            <table className="dh-table">
              <thead>
                <tr><th>Пациент</th><th>Диагноз</th><th>Начало</th><th>День курса</th><th>Врач</th><th aria-label="Действия" /></tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/day-hospital/${c.id}`)}>
                    <td><strong>{c.fio || 'Без имени'}</strong>{c.birthYear && <span className="muted"> · {c.birthYear}</span>}{c.encounterId && <span className="dh-badge dh-badge--link" title="Создан из амбулаторного приёма"><Icon name="link" size={12} /> приём</span>}</td>
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
            <h2 className="card__title">Перевести из сегодняшнего приёма</h2>
            <p className="muted">ФИО, год рождения, телефон и диагноз перейдут в курс автоматически; шаблон подберётся по коду МКБ-10.</p>
            {fromVisit.length === 0 ? (
              <p className="muted">Сегодня нет приёмов без оформленного курса.</p>
            ) : (
              <ul className="dh-visits">
                {fromVisit.map((q) => (
                  <li key={q.id}>
                    <span><strong>{q.patient.fullName}</strong> <span className="muted">· {q.patient.age}</span></span>
                    <span className="muted">{q.diagnosis || 'диагноз не указан'}</span>
                    <button type="button" className="btn btn--outline" onClick={() => void startDayCourse(q.id)}>
                      <Icon name="bed" /> Оформить курс
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
              {showDone ? '▾' : '▸'} Завершённые курсы · {done.length}
            </button>
            {showDone && (
              <ul className="dh-visits">
                {done.map((c) => (
                  <li key={c.id}>
                    <span><strong>{c.fio || 'Без имени'}</strong></span>
                    <span className="muted">{c.diagnosis} · с {ddmmyyyy(c.startDate)}</span>
                    <a className="btn btn--ghost" href={`#/day-hospital/${c.id}`}>Открыть</a>
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
