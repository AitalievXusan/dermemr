import { useMemo, useState } from 'react';
import { encounter, toast, ui, updateSoap, useEnc } from '../../state';
import { cdssCheck } from '../../lib/api';
import {
  drugInGuideline, guessTopicalForm, matchGuidelines, parseDurationDays, parseFrequency, pdfUrl, useGuidelines,
  type Guideline, type GuidelineDrug, type GuidelineGroup,
} from '../../lib/guidelines';
import { uid } from '../../lib/store';
import { Icon } from '../ui/Icon';

type Tab = GuidelineGroup | 'diag';
const TABS: { key: Tab; label: string }[] = [
  { key: 'topical', label: 'Наружная' },
  { key: 'systemic', label: 'Системная' },
  { key: 'procedure', label: 'Процедуры' },
  { key: 'diag', label: 'Обследования' },
];

/** Добавить препарат из стандарта в план и сразу прогнать CDSS (аллергии, беременность, взаимодействия). */
export function addToPlan(d: GuidelineDrug, g: Guideline) {
  const text = d.d;
  const days = parseDurationDays(text) ?? parseDurationDays(d.cd);
  const list = d.g === 'topical' ? 'topicalTherapy' : 'systemicTherapy';
  const id = uid(d.g === 'topical' ? 'top' : 'sys');
  if (d.g === 'topical') {
    updateSoap((s) => {
      s.plan.topicalTherapy.push({
        id, form: guessTopicalForm(d.n, text), drugName: d.n, applicationZone: '',
        frequency: parseFrequency(text) || '1 раз в сутки', timeOfDaySlot: ['EVENING'],
        method: 'Тонким слоем', durationDays: days ?? 14, taperingScheme: '',
      });
    });
  } else {
    updateSoap((s) => {
      s.plan.systemicTherapy.push({
        id, drugName: d.n, dose: d.dd.length <= 24 ? d.dd : '',
        regimen: (parseFrequency(text) || text).slice(0, 160), mealRelation: '',
        timeOfDaySlot: ['MORNING'], durationDays: days ?? 10,
      });
    });
  }
  toast(`«${d.n}» добавлен в назначения по стандарту: ${g.title}. Проверьте дозу и кратность.`, 'success');
  const { soap, encounterId, patient } = encounter.get();
  const current = [...soap.plan.topicalTherapy, ...soap.plan.systemicTherapy].filter((x) => x.id !== id).map((x) => x.drugName);
  void cdssCheck(encounterId, d.n, current, patient).then((alerts) => {
    if (alerts.length) ui.set((u) => { u.cdss = { alerts, drugName: d.n, target: { list, id } }; });
  });
}

export function addProcedure(d: GuidelineDrug) {
  updateSoap((s) => {
    const line = `${d.n}${d.d ? ` — ${d.d}` : ''}`;
    s.plan.generalRecommendations = s.plan.generalRecommendations ? `${s.plan.generalRecommendations}\n${line}` : line;
  });
  toast(`«${d.n}» добавлено в общие рекомендации`, 'success');
}

function DrugRow({ d, g }: { d: GuidelineDrug; g: Guideline }) {
  const [open, setOpen] = useState(false);
  const long = d.d.length > 140;
  return (
    <li className="gl__item">
      <div className="gl__head">
        <span className="gl__name">{d.n}</span>
        {d.s === 'a' && <span className="gl__tag" title="Раздел «Дополнительные лечебные мероприятия» стандарта">доп.</span>}
        {d.sp && <span className="gl__tag gl__tag--spec" title="В стандарте не отмечено для первичного звена (СВП/ЦМП): назначается на уровне районных, областных или республиканских учреждений">спец. уровень</span>}
        <button
          type="button"
          className="btn btn--ghost btn--xs gl__add"
          onClick={() => (d.g === 'procedure' ? addProcedure(d) : addToPlan(d, g))}
          title={d.g === 'procedure' ? 'Добавить в общие рекомендации' : 'Добавить в назначения (с проверкой CDSS)'}
        >
          <Icon name="plus" size={13} /> {d.g === 'procedure' ? 'В рекомендации' : 'В назначения'}
        </button>
      </div>
      {d.bad ? (
        <div className="gl__dose muted">
          Текст дозировки в PDF не распознан —{' '}
          <a href={pdfUrl(g.std.file, d.p)} target="_blank" rel="noreferrer">смотреть стандарт, стр. {d.p}</a>
        </div>
      ) : (
        d.d && (
          <div className={`gl__dose${open || !long ? '' : ' is-clamped'}`} onClick={() => long && setOpen(!open)} title={long && !open ? 'Показать полностью' : undefined}>
            {d.d}
          </div>
        )
      )}
      {(d.dd || d.cd) && (
        <div className="gl__meta mono">
          {d.dd && <span>сут.: {d.dd}</span>}
          {d.cd && <span>курс: {d.cd}</span>}
        </div>
      )}
    </li>
  );
}

function GuidelineBody({ g }: { g: Guideline }) {
  const counts = useMemo(() => ({
    topical: g.drugs.filter((d) => d.g === 'topical').length,
    systemic: g.drugs.filter((d) => d.g === 'systemic').length,
    procedure: g.drugs.filter((d) => d.g === 'procedure').length,
    diag: g.diag.length,
  }), [g]);
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => counts[t.key] > 0)?.key ?? 'topical');
  const [q, setQ] = useState('');
  const [mainOnly, setMainOnly] = useState(false);
  const query = q.trim().toLowerCase();
  const drugs = tab === 'diag' ? [] : g.drugs.filter((d) => d.g === tab && (!mainOnly || d.s === 'm') && (!query || d.n.toLowerCase().includes(query) || d.d.toLowerCase().includes(query)));
  const diag = tab === 'diag' ? g.diag.filter((d) => !query || d.n.toLowerCase().includes(query) || d.c.toLowerCase().includes(query)) : [];
  const hasAdditional = g.drugs.some((d) => d.s === 'a');

  return (
    <>
      <div className="gl__links">
        {g.kp && <a href={pdfUrl(g.kp.file, g.kp.page)} target="_blank" rel="noreferrer"><Icon name="fileText" size={13} /> Клинический протокол (лечение, стр. {g.kp.page})</a>}
        <a href={pdfUrl(g.std.file, g.std.page)} target="_blank" rel="noreferrer"><Icon name="fileText" size={13} /> {g.kp ? 'Стандарт' : 'СОП'}</a>
        {g.extra.map((x) => <a key={x.file} href={pdfUrl(x.file)} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> {x.title}</a>)}
      </div>
      {g.note && <p className="gl__note">{g.note}</p>}
      <div className="gl__toolbar">
        <div className="gl__tabs" role="tablist">
          {TABS.map((t) => counts[t.key] > 0 && (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`chip${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label} <span className="mono muted">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <input className="input input--sm gl__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фильтр…" aria-label="Фильтр по протоколу" />
        {tab !== 'diag' && hasAdditional && (
          <label className="gl__check"><input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} /> только основные</label>
        )}
      </div>
      {tab === 'diag' ? (
        <ul className="gl__list">
          {diag.map((d, i) => (
            <li key={i} className="gl__item gl__item--diag">
              {(i === 0 || diag[i - 1].c !== d.c) && d.c && <div className="gl__cat">{d.c}</div>}
              <div className="gl__head">
                <span>{d.n}</span>
                {d.sp && <span className="gl__tag gl__tag--spec" title="В стандарте не отмечено для первичного звена">спец. уровень</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="gl__list">
          {drugs.map((d, i) => <DrugRow key={`${d.n}-${i}`} d={d} g={g} />)}
          {drugs.length === 0 && <li className="gl__empty muted">Ничего не найдено</li>}
        </ul>
      )}
    </>
  );
}

/** Подсказки по национальным клиническим протоколам и стандартам МЗ РУз для выбранного диагноза. */
export function GuidelinePanel() {
  const code = useEnc((s) => s.soap.assessment.primaryDiagnosis.icd10Code);
  const topical = useEnc((s) => s.soap.plan.topicalTherapy);
  const systemic = useEnc((s) => s.soap.plan.systemicTherapy);
  const all = useGuidelines();
  const [collapsed, setCollapsed] = useState(false);
  const [pick, setPick] = useState(0);
  const matches = useMemo(() => (all && code ? matchGuidelines(all, code) : []), [all, code]);
  if (!code) return null;
  if (!all) return <div className="gl gl--loading muted">Загрузка клинических протоколов…</div>;
  if (!matches.length) {
    return (
      <div className="gl gl--empty muted">
        <Icon name="fileText" size={14} /> Для диагноза <span className="mono">{code}</span> нет загруженного протокола МЗ РУз
      </div>
    );
  }
  const g = matches[Math.min(pick, matches.length - 1)];
  const planned = [...topical, ...systemic].map((x) => x.drugName).filter(Boolean);
  const outside = planned.filter((n) => !matches.some((m) => drugInGuideline(m, n)));

  return (
    <section className="gl" aria-label="Клинический протокол МЗ РУз">
      <header className="gl__bar">
        <button type="button" className="gl__toggle" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          <Icon name="fileText" size={15} />
          <span className="gl__title">Протокол МЗ РУз: {g.title}</span>
          <span className="muted gl__caret">{collapsed ? 'показать' : 'свернуть'}</span>
        </button>
        {matches.length > 1 && (
          <div className="chips chips--tight">
            {matches.map((m, i) => (
              <button key={m.id} type="button" className={`chip${m.id === g.id ? ' is-active' : ''}`} onClick={() => setPick(i)}>{m.title}</button>
            ))}
          </div>
        )}
      </header>
      {outside.length > 0 && (
        <div className="alert-pill alert-pill--warn gl__warn">
          <Icon name="alert" size={13} /> Нет в стандарте по нозологии: {outside.join(', ')}
        </div>
      )}
      {!collapsed && (
        <>
          <GuidelineBody key={g.id} g={g} />
          <p className="gl__foot muted">
            Подсказки собраны автоматически из таблиц стандартов МЗ РУз. Перед назначением сверяйте дозы с первоисточником по ссылкам выше.
          </p>
        </>
      )}
    </section>
  );
}
