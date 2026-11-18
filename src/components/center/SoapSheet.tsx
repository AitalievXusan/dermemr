import { useState } from 'react';
import { applyTemplateWithCdss } from '../../state';
import { GROUP_NAMES, MACROS, QUICK_TEMPLATES, TEMPLATE_LIBRARY } from '../../data/templates';
import { Icon } from '../ui/Icon';
import { SectionA } from './SectionA';
import { SectionO } from './SectionO';
import { SectionP } from './SectionP';
import { SectionS } from './SectionS';
import { Dictation } from './Dictation';

function TemplateSearch() {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase().replace(/^\//, '');
  const tpl = query ? TEMPLATE_LIBRARY.filter((t) => t.title.toLowerCase().includes(query) || t.icd10Code.toLowerCase().startsWith(query)).slice(0, 6) : [];
  const macros = query ? MACROS.filter((m) => m.key.startsWith(query) || m.title.toLowerCase().includes(query)).slice(0, 4) : [];
  return (
    <div className="combo combo--bar">
      <span className="combo__icon"><Icon name="search" size={14} /></span>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Шаблоны по нозологиям и макросы…" aria-label="Поиск шаблонов" onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
      {(tpl.length > 0 || macros.length > 0) && (
        <div className="combo__list">
          {tpl.map((t) => (
            <button key={t.id} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); void applyTemplateWithCdss(t); setQ(''); }}>
              <span className="mono">{t.icd10Code}</span> {t.title} <span className="combo__price">{GROUP_NAMES[t.group]}</span>
            </button>
          ))}
          {macros.map((m) => (
            <button key={m.key} type="button" className="combo__item" onMouseDown={(e) => { e.preventDefault(); navigator.clipboard?.writeText(m.text); setQ(''); }} title="Скопировать текст макроса">
              <span className="mono">/{m.key}</span> {m.title} <span className="combo__price">в буфер</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SoapSheet() {
  return (
    <div className="sheet">
      <div className="sheet__bar">
        <div className="chips" role="toolbar" aria-label="Частые нозологии">
          {QUICK_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="chip chip--nosology" onClick={() => void applyTemplateWithCdss(t)} title={`${t.icd10Code} · ${t.title}`}>
              {t.quickLabel}
            </button>
          ))}
        </div>
        <Dictation />
        <TemplateSearch />
      </div>
      <article className="sheet__paper" aria-label="Протокол SOAP">
        <SectionS />
        <SectionO />
        <SectionA />
        <SectionP />
        <p className="sheet__foot">
          <span className="mono">/</span> — макросы в любом поле · <span className="mono">Ctrl+S</span> — сохранить · <span className="mono">Ctrl+Enter</span> — завершить и сформировать документы
        </p>
      </article>
    </div>
  );
}
