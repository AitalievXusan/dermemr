import { useEffect, useMemo, useState } from 'react';
import { DH_TR, type DayLang, type DayTemplate } from '../../data/dayHospital';
import { nosDef } from '../../data/nosologies';
import { Icon } from '../ui/Icon';

/** Обезличенный лист врача (src/data/dhSheets.json): инициалы, пол, возраст — без ФИО и телефона. */
export interface PrevSheet {
  id: string;
  nos: string;
  title: string;
  ini: string;
  sex: 'm' | 'f' | '';
  age: number | null;
  course: number | null;
  dx: string;
  doctor: string;
  rows: { t: string; c: string[] }[];
}

let cache: Promise<PrevSheet[]> | null = null;
/** Листы грузятся отдельным файлом только при первом открытии окна. */
export const loadSheets = () => (cache ??= import('../../data/dhSheets.json').then((m) => m.default as unknown as PrevSheet[]));

const markClass = (v: string) => {
  const x = v.trim().toLowerCase();
  // «Х» у врача значит то «пропуск», то «процедура» — показываем нейтрально, как в оригинале
  return x === '+' ? 'is-plus' : x === '-' || x === '−' ? 'is-minus' : x === 'х' || x === 'x' ? 'is-x' : x ? 'is-dose' : '';
};

/** Окно «Прежние назначения»: листы врача по нозологии, «→ в курс» переносит строку в текущий курс. */
export function PrevSheets({ template, lang, onClose, onAdd }: {
  template: DayTemplate;
  lang: DayLang;
  onClose: () => void;
  onAdd: (row: { t: string; c: string[] }, sec: 'drug' | 'top' | 'phys') => void;
}) {
  const t = DH_TR[lang];
  const def = nosDef(template);
  const [all, setAll] = useState<PrevSheet[] | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<string>('');
  const [q, setQ] = useState('');
  const [course, setCourse] = useState<number | 0>(0);
  const [added, setAdded] = useState<string>('');

  useEffect(() => {
    loadSheets().then(setAll).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const mine = useMemo(() => (all ?? []).filter((s) => s.nos === template), [all, template]);
  const courses = useMemo(() => [...new Set(mine.map((s) => s.course).filter((x): x is number => !!x))].sort(), [mine]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return mine.filter((x) => (!course || x.course === course) && (!s || x.rows.some((r) => r.t.toLowerCase().includes(s))));
  }, [mine, q, course]);
  const cur = list.find((x) => x.id === sel) ?? list[0] ?? null;

  const label = (s: PrevSheet) => [
    s.ini || '—',
    s.sex === 'm' ? t.sexM : s.sex === 'f' ? t.sexF : '',
    s.age !== null ? (lang === 'uz' ? `${s.age} ёш` : `${s.age} ${s.age % 10 === 1 && s.age % 100 !== 11 ? 'год' : s.age % 10 >= 2 && s.age % 10 <= 4 && (s.age % 100 < 10 || s.age % 100 >= 20) ? 'года' : 'лет'}`) : '',
    s.course ? t.courseN.replace('{n}', String(s.course)) : '',
    s.title,
  ].filter(Boolean).join(' · ');

  // раздел строки: всё после «Физиотерапия» — процедуры; кремы, мази, «местно» — наружно
  const sections = (s: PrevSheet) => {
    let phys = false;
    return s.rows.map((r) => {
      if (/физиотерап|физио\s*муол/i.test(r.t)) phys = true;
      const sec: 'drug' | 'top' | 'phys' = phys ? 'phys' : /местно|маҳаллий|махаллий|крем|мазь|малҳам|гел|суюқлиги|жидкость|кастеллан/i.test(r.t) ? 'top' : 'drug';
      return sec;
    });
  };

  const add = (r: { t: string; c: string[] }, sec: 'drug' | 'top' | 'phys', key: string) => {
    onAdd(r, sec);
    setAdded(key);
    window.setTimeout(() => setAdded((a) => (a === key ? '' : a)), 1800);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.prevTitle.replace('{name}', def[lang])} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal dhs">
        <div className="modal__head">
          <h2 className="modal__title">{t.prevTitle.replace('{name}', def[lang])}</h2>
          <button type="button" className="btn btn--ghost" aria-label={t.close} onClick={onClose}><Icon name="x" /></button>
        </div>
        <p className="dhs__note muted">{t.prevNote}</p>
        {err && <div className="dh-note dh-note--warn">{err}</div>}
        {!all && !err && <div className="dhs__empty mono">{t.loading}</div>}
        {all && !mine.length && <div className="dhs__empty">{t.noSheets}</div>}
        {all && mine.length > 0 && (
          <div className="dhs__body">
            <div className="dhs__side">
              <input className="input" type="search" placeholder={t.sheetSearch} aria-label={t.sheetSearch} value={q} onChange={(e) => setQ(e.target.value)} />
              {courses.length > 1 && (
                <div className="dh-seg dhs__courses" role="group">
                  <button type="button" className={course === 0 ? 'is-on' : ''} onClick={() => setCourse(0)}>{t.all}</button>
                  {courses.map((n) => <button key={n} type="button" className={course === n ? 'is-on' : ''} onClick={() => setCourse(n)}>{n}</button>)}
                </div>
              )}
              <span className="muted dhs__count">{t.sheetCount.replace('{n}', String(list.length))}</span>
              <div className="dhs__list">
                {list.map((s) => (
                  <button key={s.id} type="button" className={`dhs__item${cur?.id === s.id ? ' is-on' : ''}`} onClick={() => setSel(s.id)}>{label(s)}</button>
                ))}
              </div>
            </div>
            <div className="dhs__sheet">
              {!cur && <div className="dhs__empty">{t.sheetPick}</div>}
              {cur && (
                <>
                  <div className="dhs__head">
                    <b>{label(cur)}</b>
                    <span className="muted">{[cur.dx, cur.doctor].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="dhs__table">
                    {cur.rows.map((r, i) => {
                      const sec = sections(cur)[i];
                      const key = `${cur.id}-${i}`;
                      if (!r.c.length) return <div key={key} className="dhs__sec">{r.t}</div>;
                      return (
                        <div key={key} className="dhs__row">
                          <span className="dhs__name">{r.t}</span>
                          <span className="dhs__cells">{r.c.slice(0, 10).map((v, j) => <span key={j} className={`dhs__c ${markClass(v)}`}>{v}</span>)}</span>
                          <button type="button" className="btn btn--ghost dhs__add" disabled={!r.t.trim()} onClick={() => add(r, sec, key)}>
                            {added === key ? <><Icon name="check" size={14} /> {t.added}</> : t.toCourse}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
