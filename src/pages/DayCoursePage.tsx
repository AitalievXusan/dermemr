import { useEffect, useRef, useState, type ReactNode } from 'react';
import { deleteDayCourse, getDayCourse, listDayCourses, patchDayCourse } from '../lib/api';
import { navigate } from '../lib/router';
import { toast } from '../state';
import {
  COURSE_DAYS, DH_TR, PATTERNS, WARN, courseDates, ddmm, ddmmyyyy, emptyRow, isIsotretinoin, nextMark, templateRows,
  type AfterRow, type DayCourse, type DayCourseInput, type DayLang, type DayPattern, type DayRow, type DaySection, type DayTemplate, type VitParams,
} from '../data/dayHospital';
import {
  DEFAULT_VIT, ageGroup, ageOf, buildVit, dexCells, dexFromRows, followDate, initialParams, isChild, isLegacyVit, mergeAfter, mergeRebuild,
  rowHints, stdOf, vitHistory, yearsRu, type Chip,
} from '../data/vitBuilder';
import { Icon } from '../components/ui/Icon';
import { FlagRu, FlagUz } from '../components/ui/Flags';
import { rememberDoctor } from './DayHospitalPage';
import { tr } from '../lib/i18n';

type Editable = Omit<DayCourse, 'id' | 'createdAt' | 'updatedAt'>;
const SECTIONS: DaySection[] = ['drug', 'top', 'phys'];

/** Клетка листа: одинаковый размер, крупные «+» и «−», дозы обычным шрифтом. */
function Cell({ v, label, onClick }: { v: string; label: string; onClick: () => void }) {
  const kind = v === '+' ? 'plus' : v === '-' ? 'minus' : v ? 'dose' : 'empty';
  return (
    <button type="button" className={`dh-cell dh-cell--${kind}`} aria-label={label} onClick={onClick}>
      {v === '-' ? '−' : v}
    </button>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="dh-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Tr = (typeof DH_TR)[DayLang];
/** Почему строка попала в лист — короткая метка на языке листа. */
function whyText(why: string, t: Tr): string {
  const [k, a, b] = why.split(':');
  if (k === 'age') return t.whyAge;
  if (k === 'kid') return t.whyKid;
  if (k === 'course') return t.whyCourse.replace('{n}', a);
  if (k === 'stat') return t.whyStat;
  if (k === 'prog') return t.whyProg;
  if (k === 'setton') return t.whySetton;
  if (k === 'mz') return t.whyMz;
  if (k === 'back') return t.whyBack;
  if (k === 'dex') return t.whyDex.replace('{a}', a).replace('{b}', b);
  if (k === 'dexage') return t.whyDexAge;
  return '';
}
let afterSeq = 0;
const afterId = () => `af_${Date.now().toString(36)}_${(afterSeq++).toString(36)}`;

/** Последнее незавершённое сохранение курса: список курсов ждёт его, чтобы не показать старые данные. */
export let lastCourseSave: Promise<void> = Promise.resolve();

export function DayCoursePage({ id }: { id: string }) {
  const [course, setCourse] = useState<DayCourse | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'saved' | 'pending' | 'saving'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<DayCourseInput>({});
  // все курсы — для номера курса и дозы дексаметазона по прошлому курсу пациента (загружаются один раз)
  const [history, setHistory] = useState<DayCourse[] | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const builtGroup = useRef<string>('');

  const inflight = useRef<Promise<void> | null>(null);

  // Сохранения идут строго по очереди: следующее ждёт ответа на предыдущее (в облаке ответ ~0,5 с),
  // иначе изменения могли бы прийти на сервер в другом порядке.
  const flush = async (): Promise<void> => {
    if (inflight.current) {
      await inflight.current;
      return flush();
    }
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setSaving('saving');
    inflight.current = (async () => {
      try {
        await patchDayCourse(id, patch);
        setSaving(Object.keys(pending.current).length ? 'pending' : 'saved');
      } catch (e) {
        setSaving('pending');
        pending.current = { ...patch, ...pending.current };
        toast(`${tr('Курс не сохранён')}: ${(e as Error).message}`, 'danger');
      }
    })();
    lastCourseSave = inflight.current;
    try {
      await inflight.current;
    } finally {
      inflight.current = null;
    }
  };

  useEffect(() => {
    getDayCourse(id).then(setCourse).catch((e) => setError((e as Error).message));
    return () => {
      // уходя со страницы, не теряем последние правки (раньше они пропадали, если не прошло 0,6 с)
      clearTimeout(timer.current);
      lastCourseSave = flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isVit = course?.template === 'vit';
  useEffect(() => {
    if (!isVit || history) return;
    let alive = true;
    listDayCourses().then((all) => alive && setHistory(all)).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [isVit, history]);

  const update = (patch: Partial<Editable>) => {
    setCourse((c) => (c ? { ...c, ...patch } : c));
    pending.current = { ...pending.current, ...patch };
    setSaving('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };

  /** Собрать лист конструктором. legacyAsk — спросить перед заменой листа старого шаблона. */
  const rebuild = (c: DayCourse, params: VitParams, hist: DayCourse[] | null, legacyAsk = true) => {
    const h = vitHistory(c, hist ?? []);
    const age = ageOf(c.birthYear, c.startDate);
    const built = buildVit({ age, params, startDate: c.startDate, prevDex: h.lastDex, prevStart: h.last?.startDate ?? null });
    builtGroup.current = ageGroup(age);
    setChips(built.chips);
    const legacy = isLegacyVit(c.rows);
    if (legacy && legacyAsk && !window.confirm(DH_TR[c.lang].replaceLegacy)) {
      update({ vit: params });
      return;
    }
    update({
      vit: params,
      rows: legacy ? built.rows : mergeRebuild(c.rows, built.rows),
      after: mergeAfter(c.after, built.after),
      followWeeks: c.followWeeks ?? 4,
    });
  };

  // Первое открытие курса витилиго: номер курса по истории пациента, стадия — из диагноза
  useEffect(() => {
    if (!course || course.template !== 'vit' || !history) return;
    const h = vitHistory(course, history);
    if (!course.vit) {
      const params = initialParams(course, h);
      if (!course.rows.length) rebuild(course, params, history, false);
      else update({ vit: params });
    } else if (!chips.length) {
      const age = ageOf(course.birthYear, course.startDate);
      builtGroup.current = ageGroup(age);
      setChips(buildVit({ age, params: course.vit, startDate: course.startDate, prevDex: h.lastDex, prevStart: h.last?.startDate ?? null }).chips);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, course?.template, history]);

  if (error) return <div className="page-msg">Не удалось открыть курс: {error}. <a href="#/day-hospital">К списку</a></div>;
  if (!course) return <div className="page-msg mono">Загрузка курса…</div>;

  const lang = course.lang;
  const t = DH_TR[lang];
  const dates = courseDates(course.startDate);
  const rows = course.rows;
  const setRows = (next: DayRow[]) => update({ rows: next });
  const setRow = (rowId: string, patch: Partial<DayRow>) => setRows(rows.map((r) => (r.id === rowId ? { ...r, ...patch, ...(r.auto ? { edited: true } : {}) } : r)));
  const setName = (r: DayRow, v: string) => setRow(r.id, {
    ...(lang === 'uz' ? { uz: v } : { ru: v }),
    // строка врача: отметку стандарта ставим по названию препарата
    ...(r.auto ? {} : { std: stdOf(lang === 'uz' ? (r.ru || v) : v) }),
  });
  const age = ageOf(course.birthYear, course.startDate);
  const vit = course.vit ?? DEFAULT_VIT;
  const setParam = (patch: Partial<VitParams>) => rebuild(course, { ...vit, ...patch }, history);
  const hist = history ? vitHistory(course, history) : null;
  const after = course.after ?? [];
  const setAfter = (next: AfterRow[]) => update({ after: next });
  const stdIn = rows.filter((r) => r.std === true).length;
  const stdOut = rows.filter((r) => r.std === false).length;
  const eptaRemoved = course.template === 'vit' && isChild(age) && !vit.eptaBack && !rows.some((r) => /epta|эпта/i.test(`${r.ru} ${r.uz}`));
  const ageLabel = age === null ? t.ageNone : `${age < 12 ? t.ageKid : age < 18 ? t.ageTeen : t.ageAdult} · ${lang === 'uz' ? `${age} ёш` : yearsRu(age)}`;
  const follow = followDate(course.startDate, course.followWeeks ?? 0);
  const onBirthBlur = () => {
    if (course.template !== 'vit' || !course.vit) return;
    if (ageGroup(ageOf(course.birthYear, course.startDate)) !== builtGroup.current) rebuild(course, course.vit, history);
  };
  const setStart = (v: string) => {
    // дексаметазон по пн и чт: дни меняются вместе с датой начала (если врач не правил строку сам)
    update({
      startDate: v,
      rows: rows.map((r) => {
        if (r.key !== 'dex' || r.edited) return r;
        const tabs = dexFromRows([r]);
        return tabs ? { ...r, cells: dexCells(v, tabs) } : r;
      }),
    });
  };

  const addRow = (sec: DaySection) => {
    const next = [...rows];
    let at = -1;
    next.forEach((r, i) => { if (r.sec === sec) at = i; });
    const fresh = emptyRow(sec);
    if (at < 0) {
      // новая секция встаёт на своё место: препараты → наружно → физиотерапия
      const order = SECTIONS.indexOf(sec);
      const before = next.findIndex((r) => SECTIONS.indexOf(r.sec) > order);
      next.splice(before < 0 ? next.length : before, 0, fresh);
    } else next.splice(at + 1, 0, fresh);
    setRows(next);
  };
  const setPattern = (r: DayRow, pk: DayPattern) => setRow(r.id, pk === 'manual' ? { pk } : { pk, cells: PATTERNS[pk]() });
  const pickTemplate = (tpl: DayTemplate) => {
    if (tpl === course.template) return;
    const edited = rows.some((r) => r.ru || r.uz);
    if (edited && !window.confirm(t.replaceTpl)) return;
    if (tpl === 'vit') {
      const c = { ...course, template: tpl, rows: [] as DayRow[], after: course.after?.filter((r) => !r.auto) };
      setCourse(c);
      update({ template: tpl });
      // история нужна для номера курса и дозы дексаметазона; список курсов приходит за доли секунды
      void (history ? Promise.resolve(history) : listDayCourses().catch(() => [] as DayCourse[])).then((all) => {
        if (!history) setHistory(all);
        rebuild(c, course.vit ?? initialParams(course, vitHistory(course, all)), all, false);
      });
      return;
    }
    update({ template: tpl, rows: templateRows(tpl), after: (course.after ?? []).filter((r) => !r.auto) });
  };
  const remove = async () => {
    if (!window.confirm(t.confirmDelete)) return;
    clearTimeout(timer.current);
    pending.current = {};
    await deleteDayCourse(id);
    navigate('/day-hospital');
  };
  const goPrint = async () => {
    clearTimeout(timer.current);
    await flush();
    navigate(`/day-hospital/${id}/print/${lang}`);
  };

  let n = 0;
  const field = (key: 'fio' | 'birthYear' | 'phone' | 'diagnosis' | 'doctor', label: string, wide = false) => (
    <label className={`dh-field${wide ? ' dh-field--wide' : ''}`}>
      <span>{label}</span>
      <input
        className={`input${course.encounterId ? ' input--linked' : ''}`}
        value={course[key]}
        onChange={(e) => update({ [key]: e.target.value } as Partial<Editable>)}
        onBlur={key === 'doctor' ? (e) => rememberDoctor(e.target.value) : key === 'birthYear' ? onBirthBlur : undefined}
      />
    </label>
  );

  return (
    <div className="page dh-course" lang={lang === 'uz' ? 'uz-Cyrl' : 'ru'}>
      <header className="dh-bar">
        <a className="btn btn--ghost btn--tall" href="#/day-hospital"><Icon name="arrowLeft" /> {t.section}</a>
        <h1 className="dh-bar__title">{t.title}</h1>
        <span className={`dh-bar__save muted is-${saving}`}>{saving === 'saved' ? <><Icon name="check" size={14} /> {t.saved}</> : t.saving}</span>
        <Seg<DayLang>
          label="Язык / Тил"
          value={lang}
          onChange={(v) => update({ lang: v })}
          options={[{ value: 'ru', label: <><FlagRu /> Рус</> }, { value: 'uz', label: <><FlagUz /> Ўзб</> }]}
        />
        <button type="button" className="btn btn--primary btn--tall" onClick={() => void goPrint()}>
          <Icon name="printer" /> {t.print}
        </button>
      </header>

      <main className="dh-main">
        <section className="card">
          <div className="card__row">
            <h2 className="card__title">{t.patient}</h2>
            {course.status === 'DONE' && <span className="dh-badge dh-badge--done">{t.done}</span>}
          </div>
          {course.encounterId && (
            <div className="dh-note dh-note--ok">
              <Icon name="check" /> <span>{t.linked}</span>
              <a href={`#/encounter/${course.encounterId}`}>{t.openVisit}</a>
            </div>
          )}
          <div className="dh-fields">
            {field('fio', t.fio, true)}
            {field('birthYear', t.year)}
            {field('phone', t.phone)}
          </div>
          <div className="dh-fields">
            {field('diagnosis', t.dx, true)}
            {field('doctor', t.doctor)}
            <label className="dh-field">
              <span>{t.start}</span>
              <input className="input" type="date" value={course.startDate} onChange={(e) => e.target.value && setStart(e.target.value)} />
            </label>
          </div>
          <div className="dh-fields dh-fields--end">
            <div className="dh-field dh-field--wide">
              <span>{t.template}</span>
              <Seg<DayTemplate>
                label={t.template}
                value={course.template}
                onChange={pickTemplate}
                options={[{ value: 'vit', label: t.vit }, { value: 'acne', label: t.acne }, { value: 'empty', label: t.empty }]}
              />
            </div>
            <span className="muted dh-fields__note">{t.course}</span>
          </div>
        </section>

        {course.template === 'vit' && (
          <section className="card dhb">
            <div className="dhb__head">
              <h2 className="card__title">{t.builder}</h2>
              <span className="muted">{t.builderHint}</span>
            </div>
            <div className="dhb__grid">
              <div className="dh-field"><span>{t.stage}</span>
                <Seg<VitParams['stage']> label={t.stage} value={vit.stage} onChange={(v) => setParam({ stage: v })} options={[{ value: 'prog', label: t.prog }, { value: 'stat', label: t.stat }]} />
              </div>
              <div className="dh-field"><span>{t.courseNo}{hist && <> · <b className="dhb__sug">{hist.count ? t.courseSug.replace('{n}', String(Math.min(4, hist.count + 1))) : t.courseFirst}</b></>}</span>
                <Seg<string> label={t.courseNo} value={String(vit.course)} onChange={(v) => setParam({ course: Number(v) as VitParams['course'] })}
                  options={[{ value: '1', label: t.c1 }, { value: '2', label: t.c2 }, { value: '3', label: t.c3 }, { value: '4', label: t.c4 }]} />
              </div>
              <div className="dh-field"><span>{t.setton}</span>
                <Seg<string> label={t.setton} value={vit.setton ? 'y' : 'n'} onChange={(v) => setParam({ setton: v === 'y' })} options={[{ value: 'n', label: t.no }, { value: 'y', label: t.yes }]} />
              </div>
              <div className="dh-field"><span>{t.age}</span>
                <span className={`dhb__age${isChild(age) ? ' is-child' : ''}`}>{ageLabel}</span>
              </div>
            </div>
            <div className="dhb__applied">
              <span className="dhb__label">{t.applied}</span>
              <div className="dhb__chips">{chips.map((c, i) => <span key={i} className="dhb__chip">{c[lang]}</span>)}</div>
              <div className="dhb__actions">
                <button type="button" className="btn btn--outline btn--sm" onClick={() => rebuild(course, vit, history)}><Icon name="refresh" /> {t.rebuild}</button>
                <span className="muted">{t.rebuildHint}</span>
              </div>
            </div>
          </section>
        )}
        {(stdIn > 0 || stdOut > 0) && (
          <div className="dh-note dh-note--ok"><Icon name="check" /> {t.stdLine.replace('{n}', String(stdIn)).replace('{m}', String(stdIn + stdOut))}{stdOut > 0 && <> · <b>{t.outLine.replace('{k}', String(stdOut))}</b></>}</div>
        )}
        {course.template === 'acne' && <div className="dh-note dh-note--warn"><Icon name="alert" /> {t.noProto}</div>}

        <section className="card dh-sheet">
          <div className="dh-grid dh-grid--head">
            <span>№</span><span>{t.colName}</span><span>{t.colPat}</span>
            {dates.map((d) => <span key={d.toISOString()} className="dh-grid__date mono">{ddmm(d)}</span>)}
            <span />
          </div>
          {SECTIONS.map((sec) => (
            <div key={sec}>
              <div className="dh-sec">
                <span className="dh-sec__title">{t[sec]}</span>
                <button type="button" className="btn btn--outline btn--sm dh-sec__add" onClick={() => addRow(sec)}><Icon name="plus" /> {t.addRow}</button>
              </div>
              {rows.filter((r) => r.sec === sec).map((r) => {
                n += 1;
                const name = r[lang] || r.ru || r.uz;
                const warn = isIsotretinoin(r.ru) || isIsotretinoin(r.uz);
                return (
                  <div key={r.id} className="dh-row">
                    <div className="dh-grid">
                      <span className="dh-grid__n mono">{n}</span>
                      <span className="dh-grid__name">
                        <input className="input" aria-label={t.colName} value={r[lang]} placeholder={lang === 'uz' && r.ru ? r.ru : t.namePh} onChange={(e) => setName(r, e.target.value)} />
                        {(r.std !== null || r.why) && (
                          <span className="dh-tags">
                            {r.std === true && <span className="dh-std">{t.inStd}</span>}
                            {r.std === false && <span className="dh-std dh-std--out">{t.outStd}</span>}
                            {r.why && whyText(r.why, t) && <span className="dh-std dh-std--why">{whyText(r.why, t)}</span>}
                          </span>
                        )}
                      </span>
                      <select className="select" aria-label={t.colPat} value={r.pk} onChange={(e) => setPattern(r, e.target.value as DayPattern)}>
                        <option value="daily">{t.pDaily}</option>
                        <option value="odd">{t.pOdd}</option>
                        <option value="even">{t.pEven}</option>
                        <option value="home">{t.pHome}</option>
                        <option value="manual">{t.pManual}</option>
                      </select>
                      {r.cells.slice(0, COURSE_DAYS).map((v, ci) => (
                        <Cell
                          key={ci}
                          v={v}
                          label={`${name || t.namePh}, ${ddmm(dates[ci])}: ${v || '—'}`}
                          onClick={() => setRow(r.id, { pk: 'manual', cells: r.cells.map((c, j) => (j === ci ? nextMark(c) : c)) })}
                        />
                      ))}
                      <button type="button" className="dh-remove" aria-label={t.remove} title={t.remove} onClick={() => setRows(rows.filter((x) => x.id !== r.id))}>×</button>
                    </div>
                    {warn && <div className="dh-warn"><Icon name="alert" /> {WARN[lang]}</div>}
                    {rowHints(r, age).map((h, hi) => <div key={hi} className={h.kind === 'warn' ? 'dh-warn' : 'dh-hint'}><Icon name="alert" /> {h[lang]}</div>)}
                  </div>
                );
              })}
              {sec === 'top' && eptaRemoved && (
                <div className="dh-removed">
                  <Icon name="alert" /> <b>{t.eptaRemoved}</b>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setParam({ eptaBack: true })}>{t.eptaBack}</button>
                </div>
              )}
            </div>
          ))}
        </section>
        <p className="muted dh-legend">{t.legend}</p>

        <section className="card dh-after">
          <div className="dhb__head">
            <h2 className="card__title">{t.after}</h2>
            <span className="muted">{t.afterHint}</span>
          </div>
          {after.map((a, i) => (
            <div key={a.id} className="dh-after__row">
              <span className="mono muted">{i + 1}</span>
              <input
                className="input"
                aria-label={t.after}
                value={a[lang]}
                placeholder={lang === 'uz' && a.ru ? a.ru : t.afterPh}
                onChange={(e) => setAfter(after.map((x) => (x.id === a.id ? { ...x, ...(lang === 'uz' ? { uz: e.target.value } : { ru: e.target.value }), auto: false } : x)))}
              />
              <button type="button" className="dh-remove" aria-label={t.removeAfter} title={t.removeAfter} onClick={() => setAfter(after.filter((x) => x.id !== a.id))}>×</button>
            </div>
          ))}
          <div className="dh-after__foot">
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setAfter([...after, { id: afterId(), ru: '', uz: '' }])}><Icon name="plus" /> {t.addAfter}</button>
            <label className="dh-after__follow">
              <span>{t.follow}:</span>
              <select className="select" value={String(course.followWeeks ?? 0)} onChange={(e) => update({ followWeeks: Number(e.target.value) })}>
                <option value="0">{t.followNone}</option>
                {[1, 2, 3, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{t.followWeeks.replace('{n}', String(w))}</option>)}
              </select>
              {follow && <b>{ddmmyyyy(follow.toISOString().slice(0, 10))}</b>}
            </label>
          </div>
        </section>

        <div className="dh-actions">
          <button type="button" className="btn btn--ghost" onClick={() => void remove()}><Icon name="trash" /> {t.deleteCourse}</button>
          <span className="stepnav__spacer" />
          {course.status === 'ACTIVE' ? (
            <button type="button" className="btn btn--outline btn--tall" onClick={() => update({ status: 'DONE' })}><Icon name="checkCheck" /> {t.finish}</button>
          ) : (
            <button type="button" className="btn btn--outline btn--tall" onClick={() => update({ status: 'ACTIVE' })}>{t.reopen}</button>
          )}
        </div>
      </main>
    </div>
  );
}
