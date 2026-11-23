import { useState } from 'react';
import { removeMarker, setProjection, updateMarker, updateSoap, useEnc } from '../state';
import { media, useMedia } from '../components/left/media';
import { ProjectionCanvas } from '../components/left/BodyMap';
import { COURSE, DISTR, DermatoscopyBlock, PRIMARY, SECONDARY, SYM } from '../components/center/SectionO';
import { SmartText } from '../components/ui/SmartText';
import { Icon } from '../components/ui/Icon';
import { LESION_LABELS } from '../lib/clinicalText';
import type { Course, Distribution, LesionType, Projection, Symmetry } from '../types';
import { Card, Label, Pill, Seg, TextField } from './ui';

type View = 'body' | 'face' | 'limbs';
const viewOf = (p: Projection): View => (p === 'HEAD_FACE' ? 'face' : p === 'HANDS_FEET' ? 'limbs' : 'body');
const NAIL_SIGNS = ['точечные вдавления', 'онихолизис', 'подногтевой гиперкератоз', '«масляное пятно»', 'дистрофия', 'изменение цвета', 'паронихия'];
const FINGERS = ['I', 'II', 'III', 'IV', 'V'];

function Lesions({ onPhotos, onCalc }: { onPhotos: (markerId: string | null) => void; onCalc: () => void }) {
  const markers = useEnc((s) => s.markers);
  const calcs = useEnc((s) => s.soap.assessment.calculators);
  const items = useMedia((s) => s.items);
  const sorted = [...markers].sort((a, b) => a.number - b.number);
  const thumb = (id: string) => items.filter((i) => i.markerId === id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const entries = Object.entries(calcs);
  return (
    <Card title="Очаги" aside={markers.length || undefined} className="v-card--side">
      {sorted.length === 0 && <p className="v-muted">Нажмите на зону схемы — появится очаг с номером. Локализация заполнится сама.</p>}
      <ul className="v-lesions">
        {sorted.map((m) => {
          const t = thumb(m.id);
          return (
            <li key={m.id} className="v-lesion">
              <button type="button" className="v-lesion__num" onClick={() => setProjection(m.projection)} title="Показать на схеме">{m.number}</button>
              <strong className="v-lesion__name">{m.anatomyLabel}</strong>
              <div className="v-lesion__body">
                <select className="v-select v-select--sm" value={m.lesionType} aria-label={`Элемент очага ${m.number}`} onChange={(e) => updateMarker(m.id, { lesionType: e.target.value as LesionType })}>
                  {(Object.keys(LESION_LABELS) as LesionType[]).map((k) => <option key={k} value={k}>{LESION_LABELS[k]}</option>)}
                </select>
                <SmartText className="v-text v-text--sm" value={m.description} placeholder="Размер, цвет, особенности…" ariaLabel={`Описание очага ${m.number}`} onChange={(v) => updateMarker(m.id, { description: v })} />
              </div>
              <button type="button" className="v-lesion__photo" onClick={() => onPhotos(m.id)} title="Фото и сравнение «до / после»">
                {t ? <img src={t.url} alt="" /> : <Icon name="image" size={20} />}
              </button>
              <button type="button" className="v-icon" aria-label={`Удалить очаг ${m.number}`} onClick={() => removeMarker(m.id)}><Icon name="x" size={16} /></button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="v-btn v-btn--dashed" onClick={() => onPhotos(sorted[0]?.id ?? null)}><Icon name="upload" size={18} /> Добавить фото или дерматоскопию</button>
      <hr className="v-hr" />
      <Label>Индекс тяжести</Label>
      {entries.length > 0 ? (
        <div className="v-pills">
          {entries.map(([k, v]) => <span key={k} className="v-index"><strong className="mono">{k} {v?.score}</strong> {v?.label}</span>)}
        </div>
      ) : <p className="v-muted">Не рассчитан</p>}
      <button type="button" className="v-btn v-btn--line" onClick={onCalc}>PASI · SCORAD · EASI · DLQI</button>
    </Card>
  );
}

function Nails() {
  const text = useEnc((s) => s.soap.objective.appendagesStatus);
  const [signs, setSigns] = useState<string[]>([]);
  const [fingers, setFingers] = useState<string[]>([]);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const insert = () => {
    if (!signs.length) return;
    const line = `Ногти: ${signs.join(', ')}${fingers.length ? ` (${fingers.join(', ')} пальцы)` : ''}.`;
    updateSoap((s) => { s.objective.appendagesStatus = s.objective.appendagesStatus.trim() ? `${s.objective.appendagesStatus.trim()} ${line}` : line; });
    setSigns([]);
    setFingers([]);
  };
  return (
    <Card title="Ногти" className="v-card--side">
      <Label>Изменения</Label>
      <div className="v-pills">{NAIL_SIGNS.map((n) => <Pill key={n} on={signs.includes(n)} onClick={() => toggle(signs, setSigns, n)}>{n.charAt(0).toUpperCase() + n.slice(1)}</Pill>)}</div>
      <Label>Пальцы</Label>
      <div className="v-pills">{FINGERS.map((f) => <button key={f} type="button" className={`v-round${fingers.includes(f) ? ' is-on' : ''}`} onClick={() => toggle(fingers, setFingers, f)}>{f}</button>)}</div>
      <button type="button" className="v-btn v-btn--line" disabled={!signs.length} onClick={insert}><Icon name="plus" size={16} /> Добавить в описание</button>
      <TextField label="Придатки кожи и слизистые" value={text} onChange={(v) => updateSoap((s) => { s.objective.appendagesStatus = v; })} placeholder="Ногти, волосы (pull-test), слизистые…" rows={3} />
    </Card>
  );
}

/** Шаг 2. Осмотр: схема тела (спереди и сзади рядом), очаги с фото, описание процесса. */
export function ExamStep({ onPhotos, onCalc }: { onPhotos: (markerId: string | null) => void; onCalc: () => void }) {
  const O = useEnc((s) => s.soap.objective);
  const projection = useEnc((s) => s.activeProjection);
  const [hover, setHover] = useState<string | null>(null);
  const view = viewOf(projection);
  const pick = (v: View) => setProjection(v === 'face' ? 'HEAD_FACE' : v === 'limbs' ? 'HANDS_FEET' : 'FRONT');
  const toggleEl = (key: 'primaryElements' | 'secondaryElements', v: string) => updateSoap((s) => {
    const arr = s.objective[key];
    s.objective[key] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  });
  const openPhotos = (id: string | null) => {
    if (id) media.set((m) => { m.selectedMarker = id; });
    onPhotos(id);
  };

  return (
    <div className="v-stack">
      <div className="v-grid v-grid--side">
        <Card title={view === 'limbs' ? 'Кисти и стопы' : 'Карта тела'} aside={hover ?? (view === 'limbs' ? 'ногтевые пластины — на виде с тыла' : 'нажмите на зону, чтобы отметить очаг')}>
          <Seg<View> value={view} onChange={pick} label="Вид схемы" className="v-seg--wide" options={[{ value: 'body', label: 'Тело' }, { value: 'face', label: 'Голова и лицо' }, { value: 'limbs', label: 'Кисти, стопы, ногти' }]} />
          {view === 'body' && (
            <div className="v-figures">
              {(['FRONT', 'BACK'] as const).map((pr) => (
                <figure key={pr} className="v-figure">
                  <figcaption className="v-figure__cap">
                    <span>{pr === 'FRONT' ? 'Правая' : 'Левая'}</span>
                    <strong>{pr === 'FRONT' ? 'СПЕРЕДИ' : 'СЗАДИ'}</strong>
                    <span>{pr === 'FRONT' ? 'Левая' : 'Правая'}</span>
                  </figcaption>
                  <ProjectionCanvas projection={pr} onHover={setHover} className="v-figure__stage" />
                </figure>
              ))}
            </div>
          )}
          {view === 'face' && (
            <figure className="v-figure v-figure--face">
              <figcaption className="v-figure__cap"><span>Правая</span><strong>ГОЛОВА И ЛИЦО</strong><span>Левая</span></figcaption>
              <ProjectionCanvas projection="HEAD_FACE" onHover={setHover} className="v-figure__stage" />
            </figure>
          )}
          {view === 'limbs' && <ProjectionCanvas projection="HANDS_FEET" onHover={setHover} className="v-figure__stage v-figure__stage--limbs" />}
        </Card>
        <div className="v-stack">
          <Lesions onPhotos={openPhotos} onCalc={onCalc} />
          {view === 'limbs' && <Nails />}
        </div>
      </div>

      <Card title="Описание процесса">
        <div className="v-grid3">
          <div className="v-field"><Label>Течение</Label><Seg<Course> value={O.processCourse} options={COURSE} onChange={(v) => updateSoap((s) => { s.objective.processCourse = v; })} /></div>
          <div className="v-field"><Label>Распространённость</Label><Seg<Distribution> value={O.distribution} options={DISTR} onChange={(v) => updateSoap((s) => { s.objective.distribution = v; })} /></div>
          <div className="v-field"><Label>Симметричность</Label><Seg<Symmetry> value={O.symmetry} options={SYM} onChange={(v) => updateSoap((s) => { s.objective.symmetry = v; })} /></div>
        </div>
        <div className="v-field">
          <Label hint="первичные и вторичные элементы">Морфология</Label>
          <div className="v-pills">
            {PRIMARY.map((e) => <Pill key={e} on={O.primaryElements.includes(e)} onClick={() => toggleEl('primaryElements', e)}>{e.charAt(0).toUpperCase() + e.slice(1)}</Pill>)}
            <span className="v-pills__sep" aria-hidden="true" />
            {SECONDARY.map((e) => <Pill key={e} on={O.secondaryElements.includes(e)} onClick={() => toggleEl('secondaryElements', e)}>{e.charAt(0).toUpperCase() + e.slice(1)}</Pill>)}
          </div>
        </div>
        <div className="v-grid2">
          <TextField label="Status localis" hint="макросы через /" value={O.statusLocalis} onChange={(v) => updateSoap((s) => { s.objective.statusLocalis = v; })} placeholder="Описание процесса…  /псориаз_триада" rows={3} />
          <TextField label="Локализация" hint="заполняется с карты тела" value={O.localizationText} onChange={(v) => updateSoap((s) => { s.objective.localizationText = v; })} placeholder="Поставьте очаг на схеме…" rows={3} />
          <TextField label="Границы" value={O.bordersDescription} onChange={(v) => updateSoap((s) => { s.objective.bordersDescription = v; })} placeholder="Чёткие / размытые, периферический рост…" />
          {view !== 'limbs' && <TextField label="Придатки кожи и слизистые" value={O.appendagesStatus} onChange={(v) => updateSoap((s) => { s.objective.appendagesStatus = v; })} placeholder="Ногти, волосы (pull-test), слизистые, дермографизм…" />}
        </div>
        <div className="v-field v-derm">
          <Label hint="отметьте очаг — услуга добавится в счёт">Дерматоскопия</Label>
          <DermatoscopyBlock />
        </div>
      </Card>
    </div>
  );
}
