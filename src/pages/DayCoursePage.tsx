import { useEffect, useRef, useState, type ReactNode } from 'react';
import { deleteDayCourse, getDayCourse, patchDayCourse } from '../lib/api';
import { navigate } from '../lib/router';
import { toast } from '../state';
import {
  COURSE_DAYS, DH_TR, PATTERNS, TEMPLATE_STD_IN, TEMPLATE_STD_TOTAL, WARN, courseDates, ddmm, emptyRow, isIsotretinoin, nextMark, templateRows,
  type DayCourse, type DayCourseInput, type DayLang, type DayPattern, type DayRow, type DaySection, type DayTemplate,
} from '../data/dayHospital';
import { Icon } from '../components/ui/Icon';
import { FlagRu, FlagUz } from '../components/ui/Flags';
import { rememberDoctor } from './DayHospitalPage';

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

export function DayCoursePage({ id }: { id: string }) {
  const [course, setCourse] = useState<DayCourse | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'saved' | 'pending' | 'saving'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<DayCourseInput>({});

  useEffect(() => {
    getDayCourse(id).then(setCourse).catch((e) => setError((e as Error).message));
    return () => clearTimeout(timer.current);
  }, [id]);

  const flush = async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setSaving('saving');
    try {
      await patchDayCourse(id, patch);
      setSaving('saved');
    } catch (e) {
      setSaving('pending');
      pending.current = { ...patch, ...pending.current };
      toast(`Курс не сохранён: ${(e as Error).message}`, 'danger');
    }
  };

  const update = (patch: Partial<Editable>) => {
    setCourse((c) => (c ? { ...c, ...patch } : c));
    pending.current = { ...pending.current, ...patch };
    setSaving('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };

  if (error) return <div className="page-msg">Не удалось открыть курс: {error}. <a href="#/day-hospital">К списку</a></div>;
  if (!course) return <div className="page-msg mono">Загрузка курса…</div>;

  const lang = course.lang;
  const t = DH_TR[lang];
  const dates = courseDates(course.startDate);
  const rows = course.rows;
  const setRows = (next: DayRow[]) => update({ rows: next });
  const setRow = (rowId: string, patch: Partial<DayRow>) => setRows(rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

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
    update({ template: tpl, rows: templateRows(tpl) });
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
        onBlur={key === 'doctor' ? (e) => rememberDoctor(e.target.value) : undefined}
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
              <input className="input" type="date" value={course.startDate} onChange={(e) => e.target.value && update({ startDate: e.target.value })} />
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
          <div className="dh-note dh-note--ok"><Icon name="check" /> {t.std.replace('{n}', String(TEMPLATE_STD_IN)).replace('{m}', String(TEMPLATE_STD_TOTAL))}</div>
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
                        <input className="input" aria-label={t.colName} value={r[lang]} placeholder={lang === 'uz' && r.ru ? r.ru : t.namePh} onChange={(e) => setRow(r.id, lang === 'uz' ? { uz: e.target.value } : { ru: e.target.value })} />
                        {r.std === true && <span className="dh-std">{t.inStd}</span>}
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
                  </div>
                );
              })}
            </div>
          ))}
        </section>
        <p className="muted dh-legend">{t.legend}</p>

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
