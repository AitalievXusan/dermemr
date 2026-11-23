import { useState } from 'react';
import { updateSoap, useEnc } from '../../state';
import { dateRu } from '../../lib/format';
import { Checkbox, ChipGroup } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { SmartText } from '../ui/SmartText';
import { tr } from '../../lib/i18n';

export const COMPLAINTS = [
  'высыпания', 'зуд', 'шелушение', 'мокнутие', 'болезненность', 'чувство стянутости', 'выпадение волос', 'изменение цвета/размера родинки',
] as const;

type AnamField = 'anamnesisMorbi' | 'anamnesisVitae' | 'previousTherapySummary';
const FIELDS: { key: AnamField; label: string; placeholder: string }[] = [
  { key: 'anamnesisMorbi', label: 'Анамнез заболевания', placeholder: 'Дебют, длительность, сезонность, триггеры…  / — макросы' },
  { key: 'anamnesisVitae', label: 'Анамнез жизни', placeholder: 'Наследственность, сопутствующие заболевания…' },
  { key: 'previousTherapySummary', label: 'Ранее проведенная терапия', placeholder: 'Препараты и их эффект…' },
];

export function SectionS() {
  const S = useEnc((s) => s.soap.subjective);
  const prev = useEnc((s) => s.previousVisit);
  const [copied, setCopied] = useState(false);

  const copyPrevious = () => {
    if (!prev) return;
    updateSoap((soap) => {
      soap.subjective.anamnesisMorbi = prev.anamnesisMorbi;
      soap.subjective.anamnesisVitae = prev.anamnesisVitae;
      soap.subjective.previousTherapySummary = prev.previousTherapySummary;
    });
    setCopied(true);
  };

  return (
    <section className="soap__section" id="soap-s">
      <div className="soap__marker">S</div>
      <div className="soap__body">
        <div className="soap__row">
          <span className="soap__label">{tr('Жалобы')}</span>
          <ChipGroup
            items={COMPLAINTS}
            selected={S.complaintTags as (typeof COMPLAINTS)[number][]}
            onToggle={(t) =>
              updateSoap((s) => {
                const tags = s.subjective.complaintTags;
                s.subjective.complaintTags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
              })
            }
          />
        </div>

        <div className="soap__row soap__row--inline">
          <span className="soap__label">{tr('Зуд (ВАШ)')}</span>
          <input
            className="vas"
            type="range"
            min={0}
            max={10}
            step={1}
            value={S.itchVasScore}
            aria-label={tr('Шкала зуда ВАШ')}
            onChange={(e) => updateSoap((s) => { s.subjective.itchVasScore = Number(e.target.value); })}
          />
          <span className="mono vas__value">{S.itchVasScore}/10</span>
          <Checkbox checked={S.sleepDisturbance} onChange={(v) => updateSoap((s) => { s.subjective.sleepDisturbance = v; })}>
            {tr('Нарушение сна')}
          </Checkbox>
        </div>

        {prev ? (
          <div className="soap__row soap__row--between">
            <span className="soap__hint">{tr('Предыдущий визит')} {dateRu(prev.date)} · {prev.diagnosis}</span>
            <button type="button" className="btn btn--ghost btn--xs" onClick={copyPrevious}>
              <Icon name="copy" size={14} /> {tr('Скопировать из прошлого визита')}
            </button>
          </div>
        ) : (
          <span className="soap__hint">{tr('Первичный прием — предыдущих визитов нет')}</span>
        )}

        {FIELDS.map((f) => {
          const changed = copied && !!prev && S[f.key] !== prev[f.key];
          return (
            <div key={f.key} className={`soap__field${changed ? ' is-changed' : ''}${copied && !changed ? ' is-copied' : ''}`}>
              <span className="soap__label">
                {tr(f.label)}
                {changed && <span className="soap__flag">{tr('изменено')}</span>}
              </span>
              <SmartText value={S[f.key]} onChange={(v) => updateSoap((s) => { s.subjective[f.key] = v; })} placeholder={tr(f.placeholder)} ariaLabel={tr(f.label)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
