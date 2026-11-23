import { useEffect, useState } from 'react';
import { getDayCourse } from '../lib/api';
import { COURSE_DAYS, PRINT_TR, WARN, courseDates, ddmm, isIsotretinoin, type DayCourse } from '../data/dayHospital';
import { Icon } from '../components/ui/Icon';

// Лист назначений дневного стационара: A4 альбомная, одна страница.
// Цвета клеток: «+» — светло-зелёный, «−» — светло-розовый, пусто — жёлтый.
export function DayPrintPage({ id, lang }: { id: string; lang: 'ru' | 'uz' }) {
  const [c, setC] = useState<DayCourse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getDayCourse(id).then(setC).catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    const prev = document.title;
    if (c) document.title = `${PRINT_TR[lang].title} — ${c.fio || 'пациент'}`;
    return () => { document.title = prev; };
  }, [c, lang]);

  if (error) return <div className="page-msg">Не удалось открыть лист: {error}</div>;
  if (!c) return <div className="page-msg mono">Загрузка…</div>;

  const t = PRINT_TR[lang];
  const dates = courseDates(c.startDate);
  let n = 0;
  let physShown = false;
  const name = (r: DayCourse['rows'][number]) => r[lang] || r.ru || r.uz;
  const markClass = (v: string) => (v === '+' ? 'is-plus' : v === '-' ? 'is-minus' : v ? 'is-dose' : 'is-empty');

  return (
    <div className="dhp-wrap">
      <div className="dhp-tools no-print">
        <a className="btn btn--ghost btn--tall" href={`#/day-hospital/${id}`}><Icon name="arrowLeft" /> {lang === 'uz' ? 'Курсга қайтиш' : 'К курсу'}</a>
        <a className="btn btn--ghost btn--tall" href={`#/day-hospital/${id}/print/${lang === 'uz' ? 'ru' : 'uz'}`}>{lang === 'uz' ? 'Русская версия' : 'Ўзбекча версия'}</a>
        <button type="button" className="btn btn--primary btn--tall" onClick={() => window.print()}><Icon name="printer" /> {lang === 'uz' ? 'Чоп этиш' : 'Печать'}</button>
      </div>
      <div className={`dhp dhp--${lang}`} lang={lang === 'uz' ? 'uz-Cyrl' : 'ru'}>
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
                    {name(r)}
                    {(isIsotretinoin(r.ru) || isIsotretinoin(r.uz)) && <div className="dhp__warn">{WARN[lang]}</div>}
                  </td>
                  {r.cells.slice(0, COURSE_DAYS).map((v, i) => <td key={i} className={`dhp__mark ${markClass(v)}`}>{v === '-' ? '−' : v}</td>)}
                </tr>,
              ];
            })}
          </tbody>
        </table>
        <p className="dhp__legend">{t.legend}</p>
        <span className="dhp__spacer" />
        <div className="dhp__sign">
          <span>{t.sign1}: ______________________</span>
          <span>{t.sign2}: ______________________</span>
        </div>
      </div>
    </div>
  );
}
