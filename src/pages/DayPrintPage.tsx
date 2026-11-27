import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getDayCourse } from '../lib/api';
import { COURSE_DAYS, PRINT_TR, WARN, courseDates, ddmm, ddmmyyyy, isIsotretinoin, type DayCourse } from '../data/dayHospital';
import { DEX_NOTE, followDate, isDexRow } from '../data/vitBuilder';
import { Icon } from '../components/ui/Icon';

// Лист назначений дневного стационара: A4 альбомная. Сам лист всегда помещается на одну страницу —
// при большом числе строк он уплотняется (ступени 1–3). Рекомендации после курса печатаются под листом,
// а если места нет — на следующей странице. Цвета клеток как на экране: «+» зелёный, «−» розовый,
// доза — бежево-розовый, пусто (дома по схеме) — жёлтый. Пометок «вне стандарта» на печати нет.
export function DayPrintPage({ id, lang }: { id: string; lang: 'ru' | 'uz' }) {
  const [c, setC] = useState<DayCourse | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [afterOnFirst, setAfterOnFirst] = useState(true);
  const page1 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDayCourse(id).then(setC).catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    const prev = document.title;
    if (c) document.title = `${PRINT_TR[lang].title} — ${c.fio || 'пациент'}`;
    return () => { document.title = prev; };
  }, [c, lang]);

  // Подгонка под одну страницу: сначала переносим рекомендации, затем уплотняем строки.
  const fit = () => {
    const el = page1.current;
    if (!el || el.scrollHeight <= el.clientHeight + 1) return;
    if (afterOnFirst) setAfterOnFirst(false);
    else if (level < 3) setLevel(level + 1);
  };
  useLayoutEffect(fit);
  useEffect(() => {
    // шрифты догружаются после первого кадра — перепроверяем, и ещё раз перед печатью
    void document.fonts?.ready.then(fit);
    window.addEventListener('beforeprint', fit);
    return () => window.removeEventListener('beforeprint', fit);
  });

  if (error) return <div className="page-msg">Не удалось открыть лист: {error}</div>;
  if (!c) return <div className="page-msg mono">Загрузка…</div>;

  const t = PRINT_TR[lang];
  const dates = courseDates(c.startDate);
  let n = 0;
  let physShown = false;
  const name = (r: DayCourse['rows'][number]) => r[lang] || r.ru || r.uz;
  const markClass = (v: string) => (v === '+' ? 'is-plus' : v === '-' ? 'is-minus' : v ? 'is-dose' : 'is-empty');
  const hasDex = c.rows.some(isDexRow);
  const after = (c.after ?? []).filter((a) => (a[lang] || a.ru || a.uz).trim());
  const follow = followDate(c.startDate, c.followWeeks ?? 0);
  const hasAfter = after.length > 0 || !!follow;

  const afterBlock = (
    <div className="dhp__after">
      <h2>{t.after}</h2>
      {after.length > 0 && (
        <ol>{after.map((a) => <li key={a.id}>{a[lang] || a.ru || a.uz}</li>)}</ol>
      )}
      {follow && (
        <p className="dhp__follow">{t.follow}: <b>{ddmmyyyy(follow.toISOString().slice(0, 10))}</b> ({t.followWeeks.replace('{n}', String(c.followWeeks))})</p>
      )}
    </div>
  );

  return (
    <div className="dhp-wrap">
      <div className="dhp-tools no-print">
        <a className="btn btn--ghost btn--tall" href={`#/day-hospital/${id}`}><Icon name="arrowLeft" /> {lang === 'uz' ? 'Курсга қайтиш' : 'К курсу'}</a>
        <a className="btn btn--ghost btn--tall" href={`#/day-hospital/${id}/print/${lang === 'uz' ? 'ru' : 'uz'}`}>{lang === 'uz' ? 'Русская версия' : 'Ўзбекча версия'}</a>
        <button type="button" className="btn btn--primary btn--tall" onClick={() => window.print()}><Icon name="printer" /> {lang === 'uz' ? 'Чоп этиш' : 'Печать'}</button>
      </div>
      <div ref={page1} className={`dhp dhp--${lang} dhp--c${level}`} lang={lang === 'uz' ? 'uz-Cyrl' : 'ru'}>
        <div className="dhp__head">
          <h1>{t.title}</h1>
          <span>{t.clinic}</span>
        </div>
        <div className="dhp__info">
          <table><tbody>
            <tr><th scope="row">{t.doc}</th><td>{c.doctor}</td></tr>
            <tr><th scope="row">{t.dx}</th><td>{c.diagnosis}</td></tr>
          </tbody></table>
          <table><tbody>
            <tr><th scope="row">{t.pt}</th><td>{c.fio}</td></tr>
            <tr><th scope="row">{t.yr}</th><td>{c.birthYear}</td></tr>
            <tr><th scope="row">{t.ph}</th><td>{c.phone}</td></tr>
          </tbody></table>
        </div>
        <table className="dhp__table">
          <thead>
            <tr>
              <th scope="col" className="dhp__num">{t.num}</th>
              <th scope="col" className="dhp__name">{t.name}</th>
              {dates.map((d) => <th key={d.toISOString()} scope="col" className="dhp__date">{ddmm(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => {
              n += 1;
              const head = r.sec === 'phys' && !physShown;
              if (head) physShown = true;
              return [
                head && <tr key={`${r.id}-h`}><td colSpan={COURSE_DAYS + 2} className="dhp__section">{t.phys}</td></tr>,
                <tr key={r.id} className="dhp__row">
                  <td className="dhp__num">{n}</td>
                  <td className="dhp__name">
                    {name(r)}{isDexRow(r) && ' *'}
                    {(isIsotretinoin(r.ru) || isIsotretinoin(r.uz)) && <div className="dhp__warn">{WARN[lang]}</div>}
                  </td>
                  {r.cells.slice(0, COURSE_DAYS).map((v, i) => <td key={i} className={`dhp__mark ${markClass(v)}`}>{v === '-' ? '−' : v}</td>)}
                </tr>,
              ];
            })}
          </tbody>
        </table>
        <p className="dhp__legend">{t.legend}{hasDex && <><br /><b>* {DEX_NOTE[lang]}</b></>}</p>
        {hasAfter && afterOnFirst && afterBlock}
        <span className="dhp__spacer" />
        <div className="dhp__sign">
          <span>{t.sign1}: ______________________</span>
          <span>{t.sign2}: ______________________</span>
        </div>
      </div>
      {hasAfter && !afterOnFirst && (
        <div className={`dhp dhp--next dhp--${lang}`} lang={lang === 'uz' ? 'uz-Cyrl' : 'ru'}>
          <div className="dhp__head">
            <h1>{t.after}</h1>
            <span>{c.fio}{c.birthYear ? `, ${c.birthYear}` : ''} · {t.title} ({t.cont})</span>
          </div>
          {afterBlock}
          <span className="dhp__spacer" />
          <div className="dhp__sign"><span>{t.sign1}: ______________________</span></div>
        </div>
      )}
    </div>
  );
}
