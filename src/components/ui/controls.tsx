import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Приборный сегментный переключатель со скользящим ползунком (DESIGN §4.3). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const idx = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const btn = track.querySelectorAll<HTMLButtonElement>('.seg__btn')[idx];
      if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [idx, options.length]);

  return (
    <div className={`seg seg--${size}`} ref={trackRef} role="tablist" aria-label={ariaLabel}>
      {thumb && idx >= 0 && <span className="seg__thumb" style={{ transform: `translateX(${thumb.left - 2}px)`, width: thumb.width }} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`seg__btn${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, title }: { active?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" title={title} className={`chip${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={!!active}>
      {children}
    </button>
  );
}

export function ChipGroup<T extends string>({ items, selected, onToggle }: { items: readonly T[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="chips">
      {items.map((i) => (
        <Chip key={i} active={selected.includes(i)} onClick={() => onToggle(i)}>
          {i}
        </Chip>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <span className="stepper">
      <button type="button" aria-label="Уменьшить" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="mono">{value}</span>
      <button type="button" aria-label="Увеличить" onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`check${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__box" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export function Field({ label, children, inline }: { label: string; children: ReactNode; inline?: boolean }) {
  return (
    <label className={`field${inline ? ' field--inline' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
