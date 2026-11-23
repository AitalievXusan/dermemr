import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MACROS, type Macro } from '../../data/templates';
import { caretCoordinates } from '../../lib/caret';
import { tr } from '../../lib/i18n';

const SLASH_RE = /(^|\s)\/([\p{L}\d_]*)$/u;

// Последнее активное поле — для голосовой диктовки (вставка распознанного текста).
let activeInsert: ((text: string) => void) | null = null;
export function insertIntoActiveField(text: string): boolean {
  if (!activeInsert) return false;
  activeInsert(text);
  return true;
}

/**
 * Авторасширяемое текстовое поле без внутреннего скролла + /slash-макросы (DESIGN §5.3, SPEC §4.1).
 */
export function SmartText({
  value,
  onChange,
  placeholder,
  minRows = 1,
  className = '',
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ start: number; query: string; top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const items = useMemo<Macro[]>(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    const starts = MACROS.filter((m) => m.key.startsWith(q));
    const contains = MACROS.filter((m) => !m.key.startsWith(q) && (m.key.includes(q) || m.title.toLowerCase().includes(q)));
    return [...starts, ...contains].slice(0, 8);
  }, [menu]);

  useEffect(() => setActive(0), [menu?.query]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [menu]);

  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart;
    const before = el.value.slice(0, caret);
    const m = before.match(SLASH_RE);
    if (!m) return setMenu(null);
    const start = caret - m[2].length - 1;
    const c = caretCoordinates(el, start);
    const rect = el.getBoundingClientRect();
    setMenu({ start, query: m[2], top: rect.top + c.top + c.height + 4, left: Math.min(rect.left + c.left, window.innerWidth - 336) });
  };

  const insert = (macro: Macro) => {
    const el = ref.current;
    if (!el || !menu) return;
    const caret = el.selectionStart;
    const next = el.value.slice(0, menu.start) + macro.text + el.value.slice(caret);
    onChange(next);
    setMenu(null);
    requestAnimationFrame(() => {
      const pos = menu.start + macro.text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <>
      <textarea
        ref={ref}
        rows={minRows}
        aria-label={ariaLabel}
        className={`smart-text ${className}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target);
        }}
        onKeyDown={(e) => {
          if (!menu || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(items[active]); }
          else if (e.key === 'Escape') { e.preventDefault(); setMenu(null); }
        }}
        onFocus={() => {
          activeInsert = (text: string) => {
            const { value: v, onChange: ch } = latest.current;
            const t = text.trim();
            if (!t) return;
            const sep = v && !/\s$/.test(v) ? ' ' : '';
            ch(v + sep + (v.trim() === '' || /[.!?]\s*$/.test(v) ? t.charAt(0).toUpperCase() + t.slice(1) : t));
          };
        }}
        onBlur={() => setTimeout(() => setMenu(null), 120)}
        onClick={(e) => detect(e.currentTarget)}
      />
      {menu &&
        createPortal(
          <div className="slash" style={{ top: menu.top, left: menu.left }} role="listbox">
            {items.length ? (
              items.map((m, i) => (
                <button
                  key={m.key}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`slash__item${i === active ? ' is-active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); insert(m); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="slash__key mono">/{m.key}</span>
                  <span className="slash__title">{m.title}</span>
                </button>
              ))
            ) : (
              <div className="slash__empty">{tr('Нет макросов «/{q}»', { q: menu.query })}</div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
