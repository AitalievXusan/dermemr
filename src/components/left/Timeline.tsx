import { useEnc } from '../../state';
import { dateRu } from '../../lib/format';
import { tr } from '../../lib/i18n';

/** Лента прошлых визитов и анализов с подсветкой отклонений от референса (PRD §4.2.4). */
export function Timeline() {
  const history = useEnc((s) => s.history);
  return (
    <section className="panel" aria-label={tr('Лента визитов и анализов')}>
      <div className="panel__head"><h2 className="panel__title">{tr('Визиты и анализы')}</h2></div>
      <ol className="timeline">
        {!history.length && <li className="muted">{tr('Нет прошлых визитов и анализов')}</li>}
        {history.map((h) => (
          <li key={h.date + h.title} className="timeline__item">
            <span className="timeline__date mono">{dateRu(h.date)}</span>
            <span className="timeline__title">{h.title}</span>
            {h.kind === 'visit' && <span className="timeline__note">{h.note}</span>}
            {h.kind === 'lab' && h.values && (
              <ul className="labs">
                {h.values.map((v) => {
                  const out = v.ref[1] > 0 && (v.value > v.ref[1] || v.value < v.ref[0]);
                  return (
                    <li key={v.name} className={out ? 'is-out' : ''}>
                      <span>{v.name}</span>
                      <span className="mono">
                        {v.ref[1] > 0 ? `${v.value} ${v.unit}` : v.unit}
                        {out && (v.value > v.ref[1] ? ' ↑' : ' ↓')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
