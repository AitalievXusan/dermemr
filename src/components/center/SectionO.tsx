import { useState } from 'react';
import { toggleDermatoscopy, updateMarker, updateSoap, useEnc } from '../../state';
import { Checkbox, Chip, ChipGroup, Segmented } from '../ui/controls';
import { SmartText } from '../ui/SmartText';
import type { Course, DermatoscopyFinding, Distribution, Symmetry } from '../../types';
import { dermatoscopyText, morphologySentence } from '../../lib/clinicalText';
import { tr } from '../../lib/i18n';

export const PRIMARY = ['пятно', 'папула', 'бляшка', 'бугорок', 'узел', 'волдырь', 'везикула', 'булла', 'пустула'] as const;
export const SECONDARY = ['чешуйка', 'корка', 'эрозия', 'язва', 'трещина', 'экскориация', 'лихенификация', 'рубец', 'гиперпигментация', 'гипопигментация'] as const;
const VESSELS = ['точечные', 'клубочковые', 'древовидные', 'шпилькообразные', 'линейные извитые'];

export const COURSE: { value: Course; label: string }[] = [
  { value: 'ACUTE', label: 'Острое' }, { value: 'SUBACUTE', label: 'Подострое' }, { value: 'CHRONIC', label: 'Хроническое' },
];
export const DISTR: { value: Distribution; label: string }[] = [
  { value: 'LIMITED', label: 'Ограниченный' }, { value: 'DISSEMINATED', label: 'Распространенный' }, { value: 'UNIVERSAL', label: 'Универсальный' },
];
export const SYM: { value: Symmetry; label: string }[] = [
  { value: 'SYMMETRIC', label: 'Симметричный' }, { value: 'ASYMMETRIC', label: 'Асимметричный' },
];

export function DermatoscopyBlock() {
  const markers = useEnc((s) => s.markers);
  const derm = useEnc((s) => s.soap.objective.dermatoscopy);
  const notes = useEnc((s) => s.soap.objective.dermatoscopyNotes);
  const setF = (id: string, patch: Partial<DermatoscopyFinding>) =>
    updateSoap((soap) => { Object.assign(soap.objective.dermatoscopy[id], patch); });

  if (!markers.length) return <p className="soap__hint">{tr('Поставьте маркер очага на карте тела, чтобы заполнить дерматоскопию.')}</p>;

  return (
    <div className="derm">
      {[...markers].sort((a, b) => a.number - b.number).map((m) => {
        const f = derm[m.id];
        return (
          <div key={m.id} className={`derm__card${f ? ' is-on' : ''}`}>
            <Checkbox checked={!!f} onChange={(v) => toggleDermatoscopy(m.id, v)}>
              <span className="anchor mono">#{m.number}</span> {m.anatomyLabel}
            </Checkbox>
            {f && (
              <div className="derm__grid">
                <label className="field field--inline"><span className="field__label">{tr('Пигментная сеть')}</span>
                  <select className="select select--xs" value={f.network} onChange={(e) => setF(m.id, { network: e.target.value as DermatoscopyFinding['network'] })}>
                    <option value="">—</option><option>{tr('типичная')}</option><option>{tr('атипичная')}</option><option>{tr('негативная')}</option><option>{tr('отсутствует')}</option>
                  </select>
                </label>
                <label className="field field--inline"><span className="field__label">{tr('Точки и глобулы')}</span>
                  <select className="select select--xs" value={f.dotsGlobules} onChange={(e) => setF(m.id, { dotsGlobules: e.target.value as DermatoscopyFinding['dotsGlobules'] })}>
                    <option value="">—</option><option>{tr('регулярные')}</option><option>{tr('нерегулярные')}</option><option>{tr('отсутствуют')}</option>
                  </select>
                </label>
                <div className="chips chips--tight">
                  {VESSELS.map((v) => (
                    <Chip key={v} title={v} active={f.vessels.includes(v)} onClick={() => setF(m.id, { vessels: f.vessels.includes(v) ? f.vessels.filter((x) => x !== v) : [...f.vessels, v] })}>{v}</Chip>
                  ))}
                </div>
                <div className="derm__checks">
                  <Checkbox checked={f.streaks} onChange={(v) => setF(m.id, { streaks: v })}>{tr('Полосы')}</Checkbox>
                  <Checkbox checked={f.blueWhiteVeil} onChange={(v) => setF(m.id, { blueWhiteVeil: v })}>{tr('Бело-голубая вуаль')}</Checkbox>
                  <Checkbox checked={f.miliaCysts} onChange={(v) => setF(m.id, { miliaCysts: v })}>{tr('Милиумоподобные кисты')}</Checkbox>
                  <Checkbox checked={f.comedoOpenings} onChange={(v) => setF(m.id, { comedoOpenings: v })}>{tr('Комедоноподобные отверстия')}</Checkbox>
                </div>
                <p className="derm__auto">{dermatoscopyText(m, f)}</p>
              </div>
            )}
          </div>
        );
      })}
      <SmartText value={notes} placeholder={tr('Дополнительно к дерматоскопии…  /дерматоскопия_норма')} onChange={(v) => updateSoap((s) => { s.objective.dermatoscopyNotes = v; })} ariaLabel={tr('Заметки дерматоскопии')} />
    </div>
  );
}

export function SectionO() {
  const O = useEnc((s) => s.soap.objective);
  const markers = useEnc((s) => s.markers);
  const [morphOpen, setMorphOpen] = useState(false);
  const toggle = (key: 'primaryElements' | 'secondaryElements', v: string) =>
    updateSoap((s) => {
      const arr = s.objective[key];
      s.objective[key] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    });
  const sentence = morphologySentence(O.primaryElements, O.secondaryElements);

  return (
    <section className="soap__section" id="soap-o">
      <div className="soap__marker">O</div>
      <div className="soap__body">
        <div className="soap__grid3">
          <div><span className="soap__label">{tr('Течение')}</span><Segmented size="sm" options={COURSE} value={O.processCourse as Course} onChange={(v) => updateSoap((s) => { s.objective.processCourse = v; })} /></div>
          <div><span className="soap__label">{tr('Распространенность')}</span><Segmented size="sm" options={DISTR} value={O.distribution as Distribution} onChange={(v) => updateSoap((s) => { s.objective.distribution = v; })} /></div>
          <div><span className="soap__label">{tr('Симметричность')}</span><Segmented size="sm" options={SYM} value={O.symmetry as Symmetry} onChange={(v) => updateSoap((s) => { s.objective.symmetry = v; })} /></div>
        </div>

        <div className="soap__field">
          <span className="soap__label">{tr('Морфология')}</span>
          <button type="button" className={`morph-line${morphOpen ? ' is-open' : ''}`} onClick={() => setMorphOpen((o) => !o)}>
            {sentence || <span className="muted">{tr('Нажмите, чтобы выбрать первичные и вторичные элементы')}</span>}
          </button>
          {morphOpen && (
            <div className="morph">
              <span className="morph__group">{tr('Первичные')}</span>
              <ChipGroup items={PRIMARY} selected={O.primaryElements as (typeof PRIMARY)[number][]} onToggle={(v) => toggle('primaryElements', v)} />
              <span className="morph__group">{tr('Вторичные')}</span>
              <ChipGroup items={SECONDARY} selected={O.secondaryElements as (typeof SECONDARY)[number][]} onToggle={(v) => toggle('secondaryElements', v)} />
            </div>
          )}
        </div>

        <div className="soap__field">
          <span className="soap__label">{tr('Локализация')} <span className="soap__hint">{tr('— автозаполнение с карты тела')}</span></span>
          <SmartText value={O.localizationText} onChange={(v) => updateSoap((s) => { s.objective.localizationText = v; })} placeholder={tr('Поставьте маркер на карте тела…')} ariaLabel={tr('Локализация')} />
        </div>

        {markers.length > 0 && (
          <div className="lesions">
            {[...markers].sort((a, b) => a.number - b.number).map((m) => (
              <div key={m.id} className="lesions__row">
                <span className="anchor mono" title={tr('Инлайн-якорь очага')}>[#{m.number} {m.anatomyLabel}]</span>
                <SmartText
                  value={m.description}
                  placeholder={tr('Морфология этого очага…')}
                  ariaLabel={tr('Описание очага {n}', { n: m.number })}
                  onChange={(v) => updateMarker(m.id, { description: v })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="soap__field">
          <span className="soap__label">Status localis</span>
          <SmartText minRows={2} value={O.statusLocalis} onChange={(v) => updateSoap((s) => { s.objective.statusLocalis = v; })} placeholder={tr('Описание процесса…  /псориаз_триада')} ariaLabel="Status localis" />
        </div>
        <div className="soap__field">
          <span className="soap__label">{tr('Границы')}</span>
          <SmartText value={O.bordersDescription} onChange={(v) => updateSoap((s) => { s.objective.bordersDescription = v; })} placeholder={tr('Четкие / размытые, периферический рост…')} ariaLabel={tr('Границы')} />
        </div>

        <div className="soap__field">
          <span className="soap__label">{tr('Дерматоскопия')}</span>
          <DermatoscopyBlock />
        </div>

        <div className="soap__field">
          <span className="soap__label">{tr('Придатки кожи и слизистые')}</span>
          <SmartText value={O.appendagesStatus} onChange={(v) => updateSoap((s) => { s.objective.appendagesStatus = v; })} placeholder={tr('Ногти, волосы (pull-test), слизистые, дермографизм…')} ariaLabel={tr('Придатки кожи')} />
        </div>
      </div>
    </section>
  );
}

