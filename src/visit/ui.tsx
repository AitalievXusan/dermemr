import type { ReactNode } from 'react';
import { SmartText } from '../components/ui/SmartText';

// Крупные элементы карты приёма (вариант A): одна задача на странице, без мелких кнопок.

export function Card({ title, aside, children, className = '', eyebrow }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; eyebrow?: ReactNode }) {
  return (
    <section className={`v-card ${className}`}>
      {eyebrow && <span className="v-eyebrow">{eyebrow}</span>}
      {(title || aside) && (
        <div className="v-card__head">
          {title && <h2 className="v-card__title">{title}</h2>}
          {aside && <span className="v-card__aside">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Сегменты-«таблетки»: выбранный — тёмный. */
export function Seg<T extends string>({ value, options, onChange, label, className = '' }: { value: T | ''; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string; className?: string }) {
  return (
    <div className={`v-seg ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ on, onClick, children, title }: { on?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`v-pill${on ? ' is-on' : ''}`} aria-pressed={!!on} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="v-label">
      {children}
      {hint && <span className="v-label__hint"> — {hint}</span>}
    </span>
  );
}

/** Поле с подписью: многострочный текст с /макросами и диктовкой. */
export function TextField({ label, hint, value, onChange, placeholder, rows = 2, className = '' }: { label: ReactNode; hint?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string }) {
  return (
    <div className={`v-field ${className}`}>
      <Label hint={hint}>{label}</Label>
      <SmartText className="v-text" value={value} onChange={onChange} placeholder={placeholder} minRows={rows} ariaLabel={typeof label === 'string' ? label : undefined} />
    </div>
  );
}

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'ink'; children: ReactNode }) {
  return <span className={`v-tag v-tag--${tone}`}>{children}</span>;
}
