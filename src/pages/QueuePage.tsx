import { useEffect, useState } from 'react';
import { createPatient, fetchQueue, newVisit, type QueueItem } from '../lib/api';
import { navigate } from '../lib/router';
import { setTheme, toast, useUi } from '../state';
import { Checkbox, Field, Segmented } from '../components/ui/controls';
import { Icon } from '../components/ui/Icon';
import { dateRu, timeHHMM } from '../lib/format';
import type { Patient, Theme } from '../types';

const STATUS: Record<QueueItem['status'], string> = { WAITING: 'Ожидает', IN_PROGRESS: 'На приеме', COMPLETED: 'Завершен', SIGNED: 'Подписан' };

export function TopBar({ title }: { title: string }) {
  const theme = useUi((s) => s.theme);
  return (
    <header className="topbar">
      <a className="topbar__brand" href="#/">DermEMR</a>
      <span className="topbar__title">{title}</span>
      <nav className="topbar__nav">
        <a href="#/">Очередь</a>
        <a href="#/day-hospital">Дневной стационар</a>
        <a href="#/cashier">Касса</a>
        <a href="#/portal">Личный кабинет</a>
      </nav>
      <Segmented<Theme> size="sm" options={[{ value: 'light', label: 'Свет' }, { value: 'dark', label: 'Тьма' }]} value={theme} onChange={setTheme} />
    </header>
  );
}

function NewPatientForm({ onCreated }: { onCreated: (encId: string) => void }) {
  const [f, setF] = useState({ fullName: '', birthDate: '', sex: 'F' as 'F' | 'M', fitzpatrick: 'II' as Patient['fitzpatrick'], phone: '+998', weightKg: 70, allergies: '', pregnant: false, consent: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await createPatient({
        fullName: f.fullName, birthDate: f.birthDate, sex: f.sex, fitzpatrick: f.fitzpatrick, phone: f.phone.length > 4 ? f.phone.replace(/[\s()-]/g, '') : '',
        weightKg: f.weightKg, allergies: f.allergies.split(',').map((a) => a.trim()).filter(Boolean),
        isPregnantOrLactating: f.pregnant, communicationConsent: f.consent,
      });
      toast('Пациент добавлен в очередь', 'success');
      onCreated(r.encounterId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel newpat">
      <div className="panel__head"><h2 className="panel__title">Новый пациент</h2></div>
      <Field label="ФИО"><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="Фамилия Имя Отчество" /></Field>
      <div className="newpat__row">
        <Field label="Дата рождения"><input className="input" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></Field>
        <Field label="Пол"><Segmented size="sm" options={[{ value: 'F', label: 'Ж' }, { value: 'M', label: 'М' }]} value={f.sex} onChange={(v) => setF({ ...f, sex: v })} /></Field>
        <Field label="Фототип">
          <select className="select" value={f.fitzpatrick} onChange={(e) => setF({ ...f, fitzpatrick: e.target.value as Patient['fitzpatrick'] })}>
            {['I', 'II', 'III', 'IV', 'V', 'VI'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <div className="newpat__row">
        <Field label="Телефон (E.164)"><input className="input mono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Вес, кг"><input className="input mono" type="number" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Аллергии (через запятую)"><input className="input" value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="Лидокаин, Пенициллины" /></Field>
      <Checkbox checked={f.pregnant} onChange={(v) => setF({ ...f, pregnant: v })}>Беременность / лактация</Checkbox>
      <Checkbox checked={f.consent} onChange={(v) => setF({ ...f, consent: v })}>Подписано ИДС на передачу документов по каналам связи</Checkbox>
      {error && <p className="danger">{error}</p>}
      <button type="button" className="btn btn--accent btn--block" disabled={busy || !f.fullName || !f.birthDate} onClick={submit}>
        <Icon name="plus" /> Добавить в очередь
      </button>
    </div>
  );
}

export function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const load = () => fetchQueue().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page">
      <TopBar title={`Прием на ${dateRu(Date.now())}`} />
      <div className="page__body page__body--split">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Очередь приема</h2>
            <span className="panel__hint">Врач: Соколова Е. А.</span>
          </div>
          {items === null && <p className="muted mono">Загрузка…</p>}
          <ul className="queue">
            {items?.map((q) => (
              <li key={q.id} className={`queue__row is-${q.status.toLowerCase()}`}>
                <span className={`queue__status is-${q.status.toLowerCase()}`}>{STATUS[q.status]}</span>
                <div className="queue__who">
                  <span className="queue__name">{q.patient.fullName}</span>
                  <span className="queue__meta">
                    {q.patient.sex === 'F' ? 'Ж' : 'М'}, {q.patient.age} · <span className="mono">{q.patient.cardNumber}</span> · {q.appointmentType === 'PRIMARY' ? 'первичный' : 'повторный'}
                    {q.startedAt ? <> · начат <span className="mono">{timeHHMM(q.startedAt)}</span></> : null}
                  </span>
                  <span className="queue__tags">
                    {q.patient.allergies.length > 0 && <span className="alert-pill">Аллергия: {q.patient.allergies.join(', ')}</span>}
                    {q.patient.isPregnantOrLactating && <span className="alert-pill">Беременность</span>}
                    {q.diagnosis && <span className="queue__dx mono">{q.diagnosis}</span>}
                  </span>
                </div>
                <div className="queue__actions">
                  {(q.status === 'COMPLETED' || q.status === 'SIGNED') && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={async () => navigate(`/encounter/${(await newVisit(q.id)).encounterId}`)}>Повторный визит</button>
                  )}
                  <button type="button" className="btn btn--instrument btn--sm" onClick={() => navigate(`/encounter/${q.id}`)}>
                    {q.status === 'WAITING' ? 'Начать прием' : 'Открыть карту'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <NewPatientForm onCreated={(id) => { void load(); navigate(`/encounter/${id}`); }} />
      </div>
    </div>
  );
}
