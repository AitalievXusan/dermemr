import { useState } from 'react';
import { setServicePrice } from '../../state';
import { findPrice, type PriceEntry } from '../../data/priceList';
import { getLang, money, tr } from '../../lib/i18n';
import type { ProcedureItem } from '../../types';

/** Название услуги на языке интерфейса (узбекское — из прайса по коду). */
export const serviceName = (it: Pick<ProcedureItem, 'serviceCode' | 'name'>) =>
  getLang() === 'uz' ? findPrice(it.serviceCode)?.nameUz ?? it.name : it.name;

export const priceName = (p: PriceEntry) => (getLang() === 'uz' && p.nameUz ? p.nameUz : p.name);

const NOTE_UZ: Record<string, string> = {
  'цена не указана': 'нархи кўрсатилмаган',
  'нет в прайсе — впишите цену': 'прайсда йўқ — нархни киритинг',
};
/** Пометка к цене: «50 000–300 000 сум», «180$», «нет в прайсе — впишите цену». */
export const noteText = (note?: string) => (!note ? '' : getLang() === 'uz' ? NOTE_UZ[note] ?? note.replace(' сум', ' сўм') : note);

/** Пометки «цены нет»: после ввода цены они больше не нужны. */
const MISSING = new Set(['цена не указана', 'нет в прайсе — впишите цену']);

/** Цена в подсказке поиска по прайсу. */
export const priceLabel = (p: PriceEntry) => (p.priceMax ? noteText(p.note) : p.price ? money(p.price) : noteText(p.note) || '—');

/**
 * Цена позиции счёта. Нажатие на сумму открывает поле ввода: цена за единицу в сумах.
 * Если цена не задана (0), поле открыто сразу — услугу «вне прайса» нельзя забыть оценить.
 */
export function PriceCell({ item, className = '' }: { item: ProcedureItem; className?: string }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  const open = () => { setVal(item.unitPrice ? String(item.unitPrice) : ''); setEdit(true); };
  const save = () => {
    const n = Number(val.replace(/[^\d]/g, ''));
    if (Number.isFinite(n)) setServicePrice(item.id, n);
    setEdit(false);
  };
  if (edit || !item.unitPrice) {
    return (
      <span className={`pricecell pricecell--edit ${className}`}>
        <input
          className="pricecell__input mono"
          inputMode="numeric"
          autoFocus={edit}
          value={edit ? val : ''}
          placeholder={tr('цена, сум')}
          aria-label={tr('Цена за единицу, сум')}
          onFocus={() => !edit && open()}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEdit(false); }}
        />
        {item.priceNote && <span className="pricecell__note">{noteText(item.priceNote)}</span>}
      </span>
    );
  }
  return (
    <button type="button" className={`pricecell ${className}`} onClick={open} title={tr('Изменить цену')}>
      <span className="mono">{money(item.unitPrice * item.quantity)}</span>
      {item.priceNote && !MISSING.has(item.priceNote) && <span className="pricecell__note">{noteText(item.priceNote)}</span>}
    </button>
  );
}
