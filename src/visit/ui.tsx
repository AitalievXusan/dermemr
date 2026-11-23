import type { ReactNode } from 'react';
import { SmartText } from '../components/ui/SmartText';
import { tr } from '../lib/i18n';

/** Строковые подписи переводятся автоматически; элементы JSX — как есть. */
const T = (x: ReactNode) => (typeof x === 'string' ? tr(x) : x);

// Крупные элементы карты приёма (вариант A): одна задача на странице, без мелких кнопок.

export function Card({ title, aside, children, className = '', eyebrow }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; eyebrow?: ReactNode }) {
  return (
    <section className={`v-card ${className}`}>
      {eyebrow && <span className="v-eyebrow">{T(eyebrow)}</span>}
      {(title || aside) && (
        <div className="v-card__head">
          {title && <h2 className="v-card__title">{T(title)}</h2>}
          {aside && <span className="v-card__aside">{T(aside)}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Сегменты-«таблетки»: выбранный — тёмный. */
export function Seg<T extends string>({ value, options, onChange, label, className = '' }: { value: T | ''; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string; className?: string }) {
  return (
    <div className={`v-seg ${className}`} role="group" aria-label={label && tr(label)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {T(o.label)}
        </button>
      ))}
    </div>
  );
}

export function Pill({ on, onClick, children, title }: { on?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`v-pill${on ? ' is-on' : ''}`} aria-pressed={!!on} onClick={onClick} title={title && tr(title)}>
      {T(children)}
    </button>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="v-label">
      {T(children)}
      {hint && <span className="v-label__hint"> — {T(hint)}</span>}
    </span>
  );
}

/** Поле с подписью: многострочный текст с /макросами и диктовкой. */
export function TextField({ label, hint, value, onChange, placeholder, rows = 2, className = '' }: { label: ReactNode; hint?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string }) {
  return (
    <div className={`v-field ${className}`}>
      <Label hint={hint}>{label}</Label>
      <SmartText className="v-text" value={value} onChange={onChange} placeholder={placeholder && tr(placeholder)} minRows={rows} ariaLabel={typeof label === 'string' ? tr(label) : undefined} />
    </div>
  );
}

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'ink'; children: ReactNode }) {
  return <span className={`v-tag v-tag--${tone}`}>{T(children)}</span>;
}
