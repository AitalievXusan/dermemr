import { useEffect, useState } from 'react';
import { fetchPatients, fetchPortal, type PortalData } from '../lib/api';
import { navigate } from '../lib/router';
import { dateRu } from '../lib/format';
import { Icon } from '../components/ui/Icon';
import { TopBar } from './QueuePage';

/** Демо Личного кабинета пациента: опубликованные документы и назначения. */
export function PortalPage({ patientId }: { patientId: string | null }) {
  const [patients, setPatients] = useState<{ id: string; fullName: string; cardNumber: string }[]>([]);
  const [data, setData] = useState<PortalData | null>(null);

  useEffect(() => { void fetchPatients().then(setPatients); }, []);
  useEffect(() => {
    setData(null);
    if (patientId) void fetchPortal(patientId).then(setData);
  }, [patientId]);

  return (
    <div className="page">
      <TopBar title="Личный кабинет пациента" />
      <div className="page__body portal">
        <label className="field">
          <span className="field__label">Пациент (в реальном ЛК — после входа по SMS)</span>
          <select className="select" value={patientId ?? ''} onChange={(e) => navigate(`/portal/${e.target.value}`)}>
            <option value="">Выберите пациента…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} · {p.cardNumber}</option>)}
          </select>
        </label>
        {data && !data.records.length && <p className="muted">Документов пока нет. Врач публикует их кнопкой «Личный кабинет».</p>}
        {data?.records.map((r) => (
          <article key={r.encounterId + r.publishedAt} className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Прием дерматолога · {dateRu(r.publishedAt)}</h2>
            </div>
            <p className="portal__dx">{r.diagnosis}</p>
            <ul className="portal__docs">
              {r.documents.map((d) => (
                <li key={d.id}>
                  <a className="btn btn--outline btn--sm" href={d.url} target="_blank" rel="noreferrer">
                    <Icon name="fileText" /> {d.title} <span className="muted mono">{d.format.toUpperCase()}</span>
                  </a>
                </li>
              ))}
            </ul>
            {r.prescribed.length > 0 && <p className="muted">Сдать до визита: {r.prescribed.join('; ')}</p>}
            {r.followUpDays ? <p className="muted">Контрольный визит через {r.followUpDays} дн.</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
