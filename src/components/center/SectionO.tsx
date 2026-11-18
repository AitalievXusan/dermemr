import { useState } from 'react';
import { toggleDermatoscopy, updateMarker, updateSoap, useEnc } from '../../state';
import { Checkbox, Chip, ChipGroup, Segmented } from '../ui/controls';
import { SmartText } from '../ui/SmartText';
import type { Course, DermatoscopyFinding, Distribution, Symmetry } from '../../types';
import { dermatoscopyText, morphologySentence } from '../../lib/clinicalText';

export const PRIMARY = ['пятно', 'папула', 'бляшка', 'бугорок', 'узел', 'волдырь', 'везикула', 'булла', 'пустула'] as const;
export const SECONDARY = ['чешуйка', 'корка', 'эрозия', 'язва', 'трещина', 'экскориация', 'лихенификация', 'рубец', 'гиперпигментация', 'гипопигментация'] as const;
const VESSELS = ['точечные', 'клубочковые', 'древовидные', 'шпилькообразные', 'линейные извитые'];

const COURSE: { value: Course; label: string }[] = [
  { value: 'ACUTE', label: 'Острое' }, { value: 'SUBACUTE', label: 'Подострое' }, { value: 'CHRONIC', label: 'Хроническое' },
];
const DISTR: { value: Distribution; label: string }[] = [
  { value: 'LIMITED', label: 'Ограниченный' }, { value: 'DISSEMINATED', label: 'Распространенный' }, { value: 'UNIVERSAL', label: 'Универсальный' },
];
const SYM: { value: Symmetry; label: string }[] = [
  { value: 'SYMMETRIC', label: 'Симметричный' }, { value: 'ASYMMETRIC', label: 'Асимметричный' },
];

function DermatoscopyBlock() {
  const markers = useEnc((s) => s.markers);
  const derm = useEnc((s) => s.soap.objective.dermatoscopy);
  const notes = useEnc((s) => s.soap.objective.dermatoscopyNotes);
  const setF = (id: string, patch: Partial<DermatoscopyFinding>) =>
    updateSoap((soap) => { Object.assign(soap.objective.dermatoscopy[id], patch); });

  if (!markers.length) return <p className="soap__hint">Поставьте маркер очага на карте тела, чтобы заполнить дерматоскопию.</p>;

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
                <label className="field field--inline"><span className="field__label">Пигментная сеть</span>
                  <select className="select select--xs" value={f.network} onChange={(e) => setF(m.id, { network: e.target.value as DermatoscopyFinding['network'] })}>
                    <option value="">—</option><option>типичная</option><option>атипичная</option><option>негативная</option><option>отсутствует</option>
                  </select>
                </label>
                <label className="field field--inline"><span className="field__label">Точки и глобулы</span>
                  <select className="select select--xs" value={f.dotsGlobules} onChange={(e) => setF(m.id, { dotsGlobules: e.target.value as DermatoscopyFinding['dotsGlobules'] })}>
                    <option value="">—</option><option>регулярные</option><option>нерегулярные</option><option>отсутствуют</option>
                  </select>
                </label>
                <div className="chips chips--tight">
                  {VESSELS.map((v) => (
                    <Chip key={v} active={f.vessels.includes(v)} onClick={() => setF(m.id, { vessels: f.vessels.includes(v) ? f.vessels.filter((x) => x !== v) : [...f.vessels, v] })}>{v}</Chip>
                  ))}
                </div>
                <div className="derm__checks">
                  <Checkbox checked={f.streaks} onChange={(v) => setF(m.id, { streaks: v })}>Полосы</Checkbox>
                  <Checkbox checked={f.blueWhiteVeil} onChange={(v) => setF(m.id, { blueWhiteVeil: v })}>Бело-голубая вуаль</Checkbox>
                  <Checkbox checked={f.miliaCysts} onChange={(v) => setF(m.id, { miliaCysts: v })}>Милиумоподобные кисты</Checkbox>
                  <Checkbox checked={f.comedoOpenings} onChange={(v) => setF(m.id, { comedoOpenings: v })}>Комедоноподобные отверстия</Checkbox>
                </div>
                <p className="derm__auto">{dermatoscopyText(m, f)}</p>
              </div>
            )}
          </div>
        );
      })}
      <SmartText value={notes} placeholder="Дополнительно к дерматоскопии…  /дерматоскопия_норма" onChange={(v) => updateSoap((s) => { s.objective.dermatoscopyNotes = v; })} ariaLabel="Заметки дерматоскопии" />
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
          <div><span className="soap__label">Течение</span><Segmented size="sm" options={COURSE} value={O.processCourse as Course} onChange={(v) => updateSoap((s) => { s.objective.processCourse = v; })} /></div>
          <div><span className="soap__label">Распространенность</span><Segmented size="sm" options={DISTR} value={O.distribution as Distribution} onChange={(v) => updateSoap((s) => { s.objective.distribution = v; })} /></div>
          <div><span className="soap__label">Симметричность</span><Segmented size="sm" options={SYM} value={O.symmetry as Symmetry} onChange={(v) => updateSoap((s) => { s.objective.symmetry = v; })} /></div>
        </div>

        <div className="soap__field">
          <span className="soap__label">Морфология</span>
          <button type="button" className={`morph-line${morphOpen ? ' is-open' : ''}`} onClick={() => setMorphOpen((o) => !o)}>
            {sentence || <span className="muted">Нажмите, чтобы выбрать первичные и вторичные элементы</span>}
          </button>
          {morphOpen && (
            <div className="morph">
              <span className="morph__group">Первичные</span>
              <ChipGroup items={PRIMARY} selected={O.primaryElements as (typeof PRIMARY)[number][]} onToggle={(v) => toggle('primaryElements', v)} />
              <span className="morph__group">Вторичные</span>
              <ChipGroup items={SECONDARY} selected={O.secondaryElements as (typeof SECONDARY)[number][]} onToggle={(v) => toggle('secondaryElements', v)} />
            </div>
          )}
        </div>

        <div className="soap__field">
          <span className="soap__label">Локализация <span className="soap__hint">— автозаполнение с карты тела</span></span>
          <SmartText value={O.localizationText} onChange={(v) => updateSoap((s) => { s.objective.localizationText = v; })} placeholder="Поставьте маркер на карте тела…" ariaLabel="Локализация" />
        </div>

        {markers.length > 0 && (
          <div className="lesions">
            {[...markers].sort((a, b) => a.number - b.number).map((m) => (
              <div key={m.id} className="lesions__row">
                <span className="anchor mono" title="Инлайн-якорь очага">[#{m.number} {m.anatomyLabel}]</span>
                <SmartText
                  value={m.description}
                  placeholder="Морфология этого очага…"
                  ariaLabel={`Описание очага ${m.number}`}
                  onChange={(v) => updateMarker(m.id, { description: v })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="soap__field">
          <span className="soap__label">Status localis</span>
          <SmartText minRows={2} value={O.statusLocalis} onChange={(v) => updateSoap((s) => { s.objective.statusLocalis = v; })} placeholder="Описание процесса…  /псориаз_триада" ariaLabel="Status localis" />
        </div>
        <div className="soap__field">
          <span className="soap__label">Границы</span>
          <SmartText value={O.bordersDescription} onChange={(v) => updateSoap((s) => { s.objective.bordersDescription = v; })} placeholder="Четкие / размытые, периферический рост…" ariaLabel="Границы" />
        </div>

        <div className="soap__field">
          <span className="soap__label">Дерматоскопия</span>
          <DermatoscopyBlock />
        </div>

        <div className="soap__field">
          <span className="soap__label">Придатки кожи и слизистые</span>
          <SmartText value={O.appendagesStatus} onChange={(v) => updateSoap((s) => { s.objective.appendagesStatus = v; })} placeholder="Ногти, волосы (pull-test), слизистые, дермографизм…" ariaLabel="Придатки кожи" />
        </div>
      </div>
    </section>
  );
}

