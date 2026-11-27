import { useEffect, useState } from 'react';
import { createPatient, fetchQueue, logout, newVisit, server, type QueueItem } from '../lib/api';
import { navigate, useHash } from '../lib/router';
import { setTheme, toast, useUi } from '../state';
import { Checkbox, Field, Segmented } from '../components/ui/controls';
import { Icon } from '../components/ui/Icon';
import { dateRu, timeHHMM } from '../lib/format';
import { ageText, dayMonth, plural, useT } from '../lib/i18n';
import { LangSwitch } from '../components/ui/Flags';
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
  const t = useT();
  useEffect(() => {
    document.title = `${title} — Dermaclinic`;
  }, [title]);
  return (
    <header className="topbar">
      <a className="topbar__brand" href="#/">Dermaclinic</a>
      <nav className="topbar__nav" aria-label={t('Разделы')}>
        {NAV.map((n) => <a key={n.href} href={n.href} aria-current={n.match(hash) ? 'page' : undefined}>{t(n.label)}</a>)}
      </nav>
      <span className="topbar__title" />
      <LangSwitch />
      <Segmented<Theme> size="sm" options={[{ value: 'light', label: t('Свет') }, { value: 'dark', label: t('Тьма') }]} value={theme} onChange={setTheme} />
      {server.config?.auth && <button type="button" className="btn btn--ghost btn--sm" onClick={() => void logout()}>{t('Выйти')}</button>}
    </header>
  );
}

function NewPatientForm({ onCreated }: { onCreated: (encId: string) => void }) {
  const [f, setF] = useState({ fullName: '', birthDate: '', sex: 'F' as 'F' | 'M', fitzpatrick: 'II' as Patient['fitzpatrick'], phone: '+998', weightKg: 70, allergies: '', pregnant: false, consent: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = useT();
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await createPatient({
        fullName: f.fullName, birthDate: f.birthDate, sex: f.sex, fitzpatrick: f.fitzpatrick, phone: f.phone.length > 4 ? f.phone.replace(/[\s()-]/g, '') : '',
        weightKg: f.weightKg, allergies: f.allergies.split(',').map((a) => a.trim()).filter(Boolean),
        isPregnantOrLactating: f.pregnant, communicationConsent: f.consent,
      });
      toast(t('Пациент добавлен в очередь'), 'success');
      onCreated(r.encounterId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel newpat q-new">
      <div className="panel__head"><h2 className="panel__title">{t('Новый пациент')}</h2></div>
      <Field label={t('ФИО')}><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder={t('Фамилия Имя Отчество')} /></Field>
      <div className="newpat__row">
        <Field label={t('Дата рождения')}><input className="input" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></Field>
        <Field label={t('Пол')}><Segmented size="sm" options={[{ value: 'F', label: t('Ж') }, { value: 'M', label: t('М') }]} value={f.sex} onChange={(v) => setF({ ...f, sex: v })} /></Field>
        <Field label={t('Фототип')}>
          <select className="select" value={f.fitzpatrick} onChange={(e) => setF({ ...f, fitzpatrick: e.target.value as Patient['fitzpatrick'] })}>
            {['I', 'II', 'III', 'IV', 'V', 'VI'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <div className="newpat__row">
        <Field label={t('Телефон (E.164)')}><input className="input mono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={t('Вес, кг')}><input className="input mono" type="number" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: Number(e.target.value) })} /></Field>
      </div>
      <Field label={t('Аллергии (через запятую)')}><input className="input" value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder={t('Лидокаин, Пенициллины')} /></Field>
      <Checkbox checked={f.pregnant} onChange={(v) => setF({ ...f, pregnant: v })}>{t('Беременность / лактация')}</Checkbox>
      <Checkbox checked={f.consent} onChange={(v) => setF({ ...f, consent: v })}>{t('Подписано ИДС на передачу документов по каналам связи')}</Checkbox>
      {error && <p className="danger">{error}</p>}
      <button type="button" className="btn btn--accent btn--block" disabled={busy || !f.fullName || !f.birthDate} onClick={submit}>
        <Icon name="plus" /> {t('Добавить в очередь')}
      </button>
    </div>
  );
}

export function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const t = useT();
  const load = () => fetchQueue().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  const [opening, setOpening] = useState<string | null>(null); // повторный визит создаётся — кнопка занята
  const repeatVisit = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try {
      navigate(`/encounter/${(await newVisit(id)).encounterId}`);
    } catch (e) {
      toast(`${t('Не удалось создать визит')}: ${(e as Error).message}`, 'danger');
      setOpening(null);
    }
  };
  const list = items ?? [];
  const inProgress = list.filter((q) => q.status === 'IN_PROGRESS').length;
  const waiting = list.filter((q) => q.status === 'WAITING').length;
  const day = dayMonth(new Date());

  return (
    <div className="page">
      <TopBar title={t('Приём на {day}', { day: dateRu(Date.now()) })} />
      <div className="page__body q-page">
        <div className="q-head">
          <div>
            <h1 className="q-title">{t('Приём на {day}', { day })}</h1>
            <p className="q-sub">
              {list.length} {plural(list.length, 'пациент', 'пациента', 'пациентов', 'бемор')} · {inProgress} {t('на приёме')} · {waiting} {plural(waiting, 'ожидает', 'ожидают', 'ожидают', 'кутмоқда')}
            </p>
          </div>
          <button type="button" className="v-btn v-btn--line v-btn--lg" onClick={() => setNewOpen((v) => !v)}>
            <Icon name={newOpen ? 'x' : 'plus'} size={18} /> {newOpen ? t('Закрыть') : t('Новый пациент')}
          </button>
        </div>
        {newOpen && <NewPatientForm onCreated={(id) => { void load(); navigate(`/encounter/${id}`); }} />}
        {items === null && <p className="muted mono">{t('Загрузка…')}</p>}
        {items !== null && list.length === 0 && <p className="q-empty">{t('Сегодня в очереди никого нет. Добавьте пациента кнопкой «Новый пациент».')}</p>}
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
                    {q.patient.sex === 'F' ? t('Ж') : t('М')} · {ageText(q.patient.age)} · {q.appointmentType === 'PRIMARY' ? t('первичный') : t('повторный')}
                    {q.startedAt ? <> · {t('начат в {time}', { time: timeHHMM(q.startedAt) })}</> : null}
                    <span className="mono q-card__card"> · {q.patient.cardNumber}</span>
                  </span>
                </div>
                <div className="q-card__tags">
                  <span className={`q-tag q-tag--${q.status.toLowerCase()}`}>{t(STATUS[q.status])}</span>
                  {q.patient.allergies.length > 0 && <span className="q-tag q-tag--danger" title={q.patient.allergies.join(', ')}>{t('Аллергия')}</span>}
                  {q.patient.isPregnantOrLactating && <span className="q-tag q-tag--danger">{t('Беременность')}</span>}
                  {q.diagnosis && <span className="q-tag">{q.diagnosis.length > 28 ? `${q.diagnosis.slice(0, 26)}…` : q.diagnosis}</span>}
                </div>
                <div className="q-card__actions">
                  {done && (
                    <button type="button" className="v-btn v-btn--soft" disabled={!!opening} onClick={() => void repeatVisit(q.id)}>{opening === q.id ? t('Создаю визит…') : t('Повторный визит')}</button>
                  )}
                  <button type="button" className={`v-btn ${active ? 'v-btn--ink' : 'v-btn--line'} v-btn--lg`} onClick={() => navigate(`/encounter/${q.id}`)}>
                    {active ? t('Продолжить') : q.status === 'WAITING' ? t('Начать приём') : t('Открыть карту')} <Icon name="arrowRight" size={18} />
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
