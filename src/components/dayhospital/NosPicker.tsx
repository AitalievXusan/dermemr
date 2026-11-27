import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DH_TR, type DayLang, type DayTemplate } from '../../data/dayHospital';
import { NOSOLOGIES, NOS_GROUPS, QUICK_NOS, guideFor, nosDef, type NosDef } from '../../data/nosologies';
import { pdfUrl, type Guideline } from '../../lib/guidelines';
import { Icon } from '../ui/Icon';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Что есть по нозологии: П — протокол, С — стандарт, число — прежние листы врача. */
function srcLabel(n: NosDef, guides: Guideline[] | null, lang: DayLang): string {
  const t = DH_TR[lang];
  const g = guides?.find((x) => x.title === n.guide) ?? null;
  const parts: string[] = [];
  if (g?.kp) parts.push('П');
  if (g?.std) parts.push('С');
  if (n.sheets) parts.push(t.sheetsN.replace('{n}', String(n.sheets)));
  else if (n.isNew) parts.push(t.isNew);
  return parts.join(' · ');
}

/**
 * Шаблон курса: строка поиска по всем нозологиям (сгруппированный список) и под ней —
 * кнопки частых нозологий. Справа — ссылки на протокол, стандарт и прежние листы врача.
 */
export function NosPicker({ value, form, lang, guides, onPick, onOpenSheets }: {
  value: DayTemplate;
  form?: string;
  lang: DayLang;
  guides: Guideline[] | null;
  onPick: (key: DayTemplate) => void;
  onOpenSheets: () => void;
}) {
  const t = DH_TR[lang];
  const cur = nosDef(value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = norm(q.trim());
    return NOSOLOGIES.filter((n) => !s || norm(n.ru).includes(s) || norm(n.uz).includes(s) || norm(n.code).includes(s) || n.icd.some((c) => norm(c).startsWith(s))
      || n.forms?.some((f) => norm(f.ru).includes(s) || norm(f.uz).includes(s)));
  }, [q]);
  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const pick = (n: NosDef) => {
    setOpen(false);
    setQ('');
    onPick(n.key);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(filtered.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && open && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); }
    else if (e.key === 'Escape') { setOpen(false); setQ(''); }
  };

  const g = guides?.find((x) => x.title === guideFor(value, form)) ?? null;
  const groups = (Object.keys(NOS_GROUPS) as (keyof typeof NOS_GROUPS)[]).map((k) => ({ k, items: filtered.filter((n) => n.group === k) })).filter((x) => x.items.length);

  return (
    <div className="dhn">
      <div className="dhn__row">
        <div className="dh-field dhn__search" ref={box}>
          <span>{t.template}</span>
          <div className={`dhn__combo${open ? ' is-open' : ''}`}>
            <Icon name="search" size={16} />
            <input
              className="input"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-label={t.template}
              placeholder={open ? t.searchPh : ''}
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKey}
            />
            {!open && <span className="dhn__cur">{cur[lang]}<span className="mono muted">{cur.code}</span></span>}
            <button type="button" className="dhn__caret" aria-label={t.template} onClick={() => setOpen((o) => !o)}>▾</button>
          </div>
          {open && (
            <div className="dhn__list" id={listId} role="listbox" aria-label={t.template}>
              {!filtered.length && <div className="dhn__empty muted">{t.noMatch}</div>}
              {groups.map(({ k, items }) => (
                <div key={k} role="group" aria-label={NOS_GROUPS[k][lang]}>
                  <div className="dhn__group">{NOS_GROUPS[k][lang]}</div>
                  {items.map((n) => {
                    const idx = filtered.indexOf(n);
                    return (
                      <div
                        key={n.key}
                        role="option"
                        aria-selected={n.key === value}
                        className={`dhn__opt${idx === hi ? ' is-hi' : ''}${n.key === value ? ' is-on' : ''}`}
                        onMouseEnter={() => setHi(idx)}
                        onMouseDown={(e) => { e.preventDefault(); pick(n); }}
                      >
                        <span className="mono dhn__code">{n.code}</span>
                        <span className="dhn__name">{n[lang]}{n.forms && <span className="muted"> · {n.forms.map((f) => f[lang].toLowerCase()).join(', ')}</span>}</span>
                        <span className="mono dhn__src">{srcLabel(n, guides, lang)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        {(g || cur.sheets > 0) && (
          <div className="dh-field dhn__links">
            <span>{t.links}</span>
            <div className="dhn__linkrow">
              {g?.kp && <a className="dhn__link" href={pdfUrl(g.kp.file, g.kp.page)} target="_blank" rel="noreferrer"><Icon name="fileText" size={16} /> {t.kp} <small>{t.pageN.replace('{n}', String(g.kp.page))}</small></a>}
              {g?.std && <a className="dhn__link" href={pdfUrl(g.std.file, g.std.page)} target="_blank" rel="noreferrer"><Icon name="fileText" size={16} /> {t.stdDoc} <small>{t.pageN.replace('{n}', String(g.std.page))}</small></a>}
              {cur.sheets > 0 && <button type="button" className="dhn__link" onClick={onOpenSheets}><Icon name="clock" size={16} /> {t.prev} <small>{t.sheetsN.replace('{n}', String(cur.sheets))}</small></button>}
            </div>
          </div>
        )}
      </div>
      <div className="dhn__quick" role="group" aria-label={t.quick}>
        {QUICK_NOS.map((n) => (
          <button key={n.key} type="button" aria-pressed={n.key === value} className={n.key === value ? 'is-on' : ''} onClick={() => n.key !== value && onPick(n.key)}>
            {(n.short ?? n)[lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
