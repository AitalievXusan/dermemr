import { updateSoap, useEnc } from '../state';
import { dateRu } from '../lib/format';
import { COMPLAINTS } from '../components/center/SectionS';
import { Dictation } from '../components/center/Dictation';
import { Icon } from '../components/ui/Icon';
import { Card, Label, Pill, TextField } from './ui';

/** Шаг 1. Жалобы и анамнез. Справа — коротко о пациенте: прошлый приём, текущее лечение, аллергии. */
export function ComplaintsStep() {
  const S = useEnc((s) => s.soap.subjective);
  const prev = useEnc((s) => s.previousVisit);
  const p = useEnc((s) => s.patient);
  const history = useEnc((s) => s.history);
  const lastIndex = history.find((h) => h.kind === 'visit' && /PASI|SCORAD|EASI|DLQI|GAGS|UAS7/.test(h.note ?? ''));
  const set = (k: 'anamnesisMorbi' | 'anamnesisVitae' | 'previousTherapySummary') => (v: string) => updateSoap((s) => { s.subjective[k] = v; });
  const toggle = (t: string) => updateSoap((s) => {
    const tags = s.subjective.complaintTags;
    s.subjective.complaintTags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
  });
  const copyPrevious = () => prev && updateSoap((s) => {
    s.subjective.anamnesisVitae = prev.anamnesisVitae;
    s.subjective.previousTherapySummary = prev.previousTherapySummary;
    if (!s.subjective.anamnesisMorbi.trim()) s.subjective.anamnesisMorbi = prev.anamnesisMorbi;
  });

  return (
    <div className="v-grid v-grid--side">
      <Card title="Жалобы" aside={<span className="v-dict">диктуйте или пишите <Dictation /></span>}>
        <TextField
          label="Жалобы и анамнез заболевания"
          value={S.anamnesisMorbi}
          onChange={set('anamnesisMorbi')}
          rows={4}
          placeholder="Что беспокоит, с какого времени, после чего усилилось, что помогает…  / — макросы"
          className="v-field--big"
        />
        <div className="v-pills">
          {COMPLAINTS.map((c) => (
            <Pill key={c} on={S.complaintTags.includes(c)} onClick={() => toggle(c)}>
              {S.complaintTags.includes(c) ? <Icon name="check" size={16} /> : '+'} {c.charAt(0).toUpperCase() + c.slice(1)}
            </Pill>
          ))}
        </div>
        <div className="v-row v-row--wrap">
          <Label>Зуд по шкале ВАШ</Label>
          <input className="v-range" type="range" min={0} max={10} step={1} value={S.itchVasScore} aria-label="Зуд по шкале ВАШ" onChange={(e) => updateSoap((s) => { s.subjective.itchVasScore = Number(e.target.value); })} />
          <strong className="mono v-range__val">{S.itchVasScore}/10</strong>
          <Pill on={S.sleepDisturbance} onClick={() => updateSoap((s) => { s.subjective.sleepDisturbance = !s.subjective.sleepDisturbance; })}>Нарушение сна</Pill>
        </div>
        <hr className="v-hr" />
        <div className="v-card__head">
          <h2 className="v-card__title">Анамнез</h2>
          {prev && <button type="button" className="v-link" onClick={copyPrevious}><Icon name="copy" size={16} /> Перенести из прошлого приёма</button>}
        </div>
        <div className="v-grid2">
          <TextField label="Анамнез жизни" value={S.anamnesisVitae} onChange={set('anamnesisVitae')} placeholder="Наследственность, сопутствующие заболевания, провоцирующие факторы…" />
          <TextField label="Что применял и эффект" value={S.previousTherapySummary} onChange={set('previousTherapySummary')} placeholder="Препараты, длительность, результат…" />
        </div>
      </Card>

      <Card title="Коротко о пациенте" className="v-card--side">
        <dl className="v-facts">
          <dt>Прошлый приём</dt>
          <dd>{prev ? `${dateRu(prev.date)} · ${prev.diagnosis}` : 'Первичный приём — прошлых визитов нет'}</dd>
          {prev?.previousTherapySummary && (<><dt>Лечение</dt><dd>{prev.previousTherapySummary}</dd></>)}
          {lastIndex && (<><dt>Последний индекс</dt><dd>{lastIndex.note?.split(' · ')[0]} · {dateRu(lastIndex.date)}</dd></>)}
          <dt>Фототип · вес</dt>
          <dd>{p.fitzpatrick} · {p.weightKg} кг</dd>
        </dl>
        {p.allergies.length > 0 && (
          <div className="v-note v-note--danger"><Icon name="alert" size={16} /> Аллергия на {p.allergies.join(', ').toLowerCase()}. Учитывается при всех назначениях.</div>
        )}
        {p.isPregnantOrLactating && <div className="v-note v-note--danger"><Icon name="alert" size={16} /> Беременность / лактация: тератогенные препараты блокируются.</div>}
      </Card>
    </div>
  );
}
