import { useEffect, useState } from 'react';
import { createPatient, fetchQueue, newVisit, type QueueItem } from '../lib/api';
import { navigate, useHash } from '../lib/router';
import { setTheme, toast, useUi } from '../state';
import { Checkbox, Field, Segmented } from '../components/ui/controls';
import { Icon } from '../components/ui/Icon';
import { dateRu, timeHHMM } from '../lib/format';
import type { Patient, Theme } from '../types';

const STATUS: Record<QueueItem['status'], string> = { WAITING: 'Ожидает', IN_PROGRESS: 'На приёме', COMPLETED: 'Завершён', SIGNED: 'Подписан' };

const NAV = [
  { href: '#/', label: 'Очередь', match: (h: string) => h === '' || h === '#/' || h.startsWith('#/encounter') },
  { href: '#/cashier', label: 'Касса', match: (h: string) => h.startsWith('#/cashier') },
  { href: '#/day-hospital', label: 'Дневной стационар', match: (h: string) => h.startsWith('#/day-hospital') },
  { href: '#/portal', label: 'Личный кабинет', match: (h: string) => h.startsWith('#/portal') },
];

/** Верхнее меню клиники: Очередь · Касса · Дневной стационар · Личный кабинет. */
export function TopBar({ title }: { title: string }) {
  const theme = useUi((s) => s.theme);
  const hash = useHash();
  useEffect(() => {
    document.title = `${title} — Dermaclinic`;
  }, [title]);
  return (
    <header className="topbar">
      <a className="topbar__brand" href="#/">Dermaclinic</a>
      <nav className="topbar__nav" aria-label="Разделы">
        {NAV.map((n) => <a key={n.href} href={n.href} aria-current={n.match(hash) ? 'page' : undefined}>{n.label}</a>)}
      </nav>
      <span className="topbar__title" />
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
    <div className="panel newpat q-new">
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

const plural3 = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

export function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const load = () => fetchQueue().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  const list = items ?? [];
  const inProgress = list.filter((q) => q.status === 'IN_PROGRESS').length;
  const waiting = list.filter((q) => q.status === 'WAITING').length;
  const day = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

  return (
    <div className="page">
      <TopBar title={`Приём на ${dateRu(Date.now())}`} />
      <div className="page__body q-page">
        <div className="q-head">
          <div>
            <h1 className="q-title">Приём на {day}</h1>
            <p className="q-sub">
              {list.length} {plural3(list.length, 'пациент', 'пациента', 'пациентов')} · {inProgress} на приёме · {waiting} {plural3(waiting, 'ожидает', 'ожидают', 'ожидают')}
            </p>
          </div>
          <button type="button" className="v-btn v-btn--line v-btn--lg" onClick={() => setNewOpen((v) => !v)}>
            <Icon name={newOpen ? 'x' : 'plus'} size={18} /> {newOpen ? 'Закрыть' : 'Новый пациент'}
          </button>
        </div>
        {newOpen && <NewPatientForm onCreated={(id) => { void load(); navigate(`/encounter/${id}`); }} />}
        {items === null && <p className="muted mono">Загрузка…</p>}
        {items !== null && list.length === 0 && <p className="q-empty">Сегодня в очереди никого нет. Добавьте пациента кнопкой «Новый пациент».</p>}
        <ul className="q-list">
          {list.map((q) => {
            const done = q.status === 'COMPLETED' || q.status === 'SIGNED';
            const active = q.status === 'IN_PROGRESS';
            return (
              <li key={q.id} className={`q-card${active ? ' is-active' : ''}`}>
                <span className="q-card__avatar"><Icon name="user" size={20} /></span>
                <div className="q-card__who">
                  <span className="q-card__name">{q.patient.fullName}</span>
                  <span className="q-card__meta">
                    {q.patient.sex === 'F' ? 'Ж' : 'М'} · {q.patient.age} · {q.appointmentType === 'PRIMARY' ? 'первичный' : 'повторный'}
                    {q.startedAt ? <> · начат в {timeHHMM(q.startedAt)}</> : null}
                    <span className="mono q-card__card"> · {q.patient.cardNumber}</span>
                  </span>
                </div>
                <div className="q-card__tags">
                  <span className={`q-tag q-tag--${q.status.toLowerCase()}`}>{STATUS[q.status]}</span>
                  {q.patient.allergies.length > 0 && <span className="q-tag q-tag--danger" title={q.patient.allergies.join(', ')}>Аллергия</span>}
                  {q.patient.isPregnantOrLactating && <span className="q-tag q-tag--danger">Беременность</span>}
                  {q.diagnosis && <span className="q-tag">{q.diagnosis.length > 28 ? `${q.diagnosis.slice(0, 26)}…` : q.diagnosis}</span>}
                </div>
                <div className="q-card__actions">
                  {done && (
                    <button type="button" className="v-btn v-btn--soft" onClick={async () => navigate(`/encounter/${(await newVisit(q.id)).encounterId}`)}>Повторный визит</button>
                  )}
                  <button type="button" className={`v-btn ${active ? 'v-btn--ink' : 'v-btn--line'} v-btn--lg`} onClick={() => navigate(`/encounter/${q.id}`)}>
                    {active ? 'Продолжить' : q.status === 'WAITING' ? 'Начать приём' : 'Открыть карту'} <Icon name="arrowRight" size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
