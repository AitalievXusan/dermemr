import { useMemo, useState } from 'react';
import { insertCalculator } from '../../state';
import {
  calcEasi, calcUas7, easiSeverity, uas7Severity, type EasiRegion, type EasiRegionInput,
  calcDlqi, calcGags, calcPasi, calcScorad, DLQI_QUESTIONS, dlqiSeverity, GAGS_GRADES, GAGS_ZONES, gagsSeverity,
  PASI_REGION_LABELS, pasiSeverity, scoradSeverity, severityFraction, type PasiRegion, type PasiRegionInput,
} from '../../lib/calculators';
import { Segmented } from '../ui/controls';
import type { CalcKey } from '../../types';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const AREA_HINT = ['0%', '<10%', '10–29%', '30–49%', '50–69%', '70–89%', '90–100%'];

function Num({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <select className="select select--xs mono" value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {range(max + 1).map((i) => (
        <option key={i} value={i}>{i}</option>
      ))}
    </select>
  );
}

function Result({ calc, score, max, sev, onInsert, extra }: { calc: CalcKey; score: number; max: number; sev: { label: string; level: 0 | 1 | 2 }; onInsert: () => void; extra?: string }) {
  const bands = { PASI: [10, 20, 72], SCORAD: [25, 50, 103], EASI: [7, 21, 72], GAGS: [18, 30, 52], DLQI: [5, 10, 30], UAS7: [15, 27, 42] }[calc];
  const lo = sev.level === 0 ? 0 : bands[sev.level - 1];
  const hi = bands[sev.level];
  const frac = severityFraction(sev.level, (score - lo) / Math.max(1, hi - lo));
  return (
    <div className="calc__result">
      <div className="calc__score">
        <span className={`calc__value mono sev-${sev.level}`}>
          {calc}: {Number.isInteger(score) ? score : score.toFixed(1)}
        </span>
        <span className="calc__label">{sev.label}{extra ? ` · ${extra}` : ''}</span>
      </div>
      <div className="sevscale" aria-hidden="true">
        <span className="sevscale__tick" style={{ left: `${frac * 100}%` }} />
      </div>
      <div className="calc__foot">
        <span className="muted mono">0–{max}</span>
        <button type="button" className="btn btn--outline btn--xs" onClick={onInsert}>Вставить в диагноз</button>
      </div>
    </div>
  );
}

function Pasi() {
  const [v, setV] = useState<Record<PasiRegion, PasiRegionInput>>({
    h: { E: 1, I: 1, D: 1, A: 1 }, u: { E: 2, I: 2, D: 2, A: 2 }, t: { E: 2, I: 2, D: 2, A: 2 }, l: { E: 3, I: 2, D: 2, A: 2 },
  });
  const [bsa, setBsa] = useState(18);
  const score = calcPasi(v);
  const sev = pasiSeverity(score);
  const set = (r: PasiRegion, k: keyof PasiRegionInput, n: number) => setV((p) => ({ ...p, [r]: { ...p[r], [k]: n } }));
  return (
    <>
      <table className="calc__table">
        <thead><tr><th /><th>E</th><th>I</th><th>D</th><th title="Площадь">A</th></tr></thead>
        <tbody>
          {(Object.keys(PASI_REGION_LABELS) as PasiRegion[]).map((r) => (
            <tr key={r}>
              <th scope="row">{PASI_REGION_LABELS[r]}</th>
              {(['E', 'I', 'D'] as const).map((k) => (
                <td key={k}><Num value={v[r][k]} max={4} onChange={(n) => set(r, k, n)} label={`${PASI_REGION_LABELS[r]} ${k}`} /></td>
              ))}
              <td><Num value={v[r].A} max={6} onChange={(n) => set(r, 'A', n)} label={`${PASI_REGION_LABELS[r]} площадь ${AREA_HINT[v[r].A]}`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="field field--inline"><span className="field__label">BSA, %</span>
        <input className="input input--xs mono" type="number" min={0} max={100} value={bsa} onChange={(e) => setBsa(Number(e.target.value))} />
      </label>
      <Result calc="PASI" score={score} max={72} sev={sev} extra={`BSA ${bsa}%`} onInsert={() => insertCalculator('PASI', { score, label: sev.label, bsaPercent: bsa }, sev.level)} />
    </>
  );
}

const SCORAD_SIGNS = ['Эритема', 'Отек / папулы', 'Мокнутие / корки', 'Экскориации', 'Лихенификация', 'Сухость'];
function Scorad() {
  const [area, setArea] = useState(20);
  const [b, setB] = useState([2, 1, 1, 2, 1, 2]);
  const [itch, setItch] = useState(6);
  const [sleep, setSleep] = useState(4);
  const score = calcScorad(area, b, itch, sleep);
  const sev = scoradSeverity(score);
  return (
    <>
      <label className="field field--inline"><span className="field__label">A · площадь, %</span>
        <input className="input input--xs mono" type="number" min={0} max={100} value={area} onChange={(e) => setArea(Number(e.target.value))} />
      </label>
      <div className="calc__grid">
        {SCORAD_SIGNS.map((s, i) => (
          <label key={s} className="calc__cell"><span>{s}</span>
            <Num value={b[i]} max={3} label={s} onChange={(n) => setB((p) => p.map((x, j) => (j === i ? n : x)))} />
          </label>
        ))}
      </div>
      <label className="field field--inline"><span className="field__label">Зуд <span className="mono">{itch}</span></span>
        <input type="range" min={0} max={10} value={itch} onChange={(e) => setItch(Number(e.target.value))} />
      </label>
      <label className="field field--inline"><span className="field__label">Сон <span className="mono">{sleep}</span></span>
        <input type="range" min={0} max={10} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} />
      </label>
      <Result calc="SCORAD" score={score} max={103} sev={sev} onInsert={() => insertCalculator('SCORAD', { score, label: sev.label }, sev.level)} />
    </>
  );
}

function Gags() {
  const [g, setG] = useState([2, 3, 2, 1, 2, 0]);
  const score = calcGags(g);
  const sev = gagsSeverity(score);
  return (
    <>
      <div className="calc__grid">
        {GAGS_ZONES.map((z, i) => (
          <label key={z.key} className="calc__cell">
            <span>{z.label} <span className="muted mono">×{z.factor}</span></span>
            <select className="select select--xs" value={g[i]} aria-label={z.label} onChange={(e) => setG((p) => p.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
              {GAGS_GRADES.map((label, n) => <option key={n} value={n}>{n} · {label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <Result calc="GAGS" score={score} max={52} sev={sev} onInsert={() => insertCalculator('GAGS', { score, label: sev.label }, sev.level)} />
    </>
  );
}

function Dlqi() {
  const [a, setA] = useState([2, 2, 1, 2, 2, 1, 2, 1, 1, 2]);
  const score = calcDlqi(a);
  const sev = dlqiSeverity(score);
  return (
    <>
      <div className="calc__grid">
        {DLQI_QUESTIONS.map((q, i) => (
          <label key={q} className="calc__cell"><span>{i + 1}. {q}</span>
            <Num value={a[i]} max={3} label={q} onChange={(n) => setA((p) => p.map((x, j) => (j === i ? n : x)))} />
          </label>
        ))}
      </div>
      <Result calc="DLQI" score={score} max={30} sev={sev} onInsert={() => insertCalculator('DLQI', { score, label: sev.label }, sev.level)} />
    </>
  );
}

function Easi() {
  const [child, setChild] = useState(false);
  const [v, setV] = useState<Record<EasiRegion, EasiRegionInput>>({
    h: { E: 1, I: 1, Ex: 1, L: 0, A: 2 }, u: { E: 2, I: 1, Ex: 2, L: 2, A: 3 }, t: { E: 1, I: 1, Ex: 1, L: 1, A: 2 }, l: { E: 2, I: 1, Ex: 1, L: 2, A: 2 },
  });
  const score = calcEasi(v, child);
  const sev = easiSeverity(score);
  const set = (r: EasiRegion, k: keyof EasiRegionInput, n: number) => setV((p) => ({ ...p, [r]: { ...p[r], [k]: n } }));
  return (
    <>
      <table className="calc__table">
        <thead><tr><th /><th title="Эритема">E</th><th title="Отек / папулы">I</th><th title="Экскориации">Ex</th><th title="Лихенификация">L</th><th title="Площадь">A</th></tr></thead>
        <tbody>
          {(Object.keys(PASI_REGION_LABELS) as EasiRegion[]).map((r) => (
            <tr key={r}>
              <th scope="row">{PASI_REGION_LABELS[r]}</th>
              {(['E', 'I', 'Ex', 'L'] as const).map((k) => (
                <td key={k}><Num value={v[r][k]} max={3} onChange={(n) => set(r, k, n)} label={`${PASI_REGION_LABELS[r]} ${k}`} /></td>
              ))}
              <td><Num value={v[r].A} max={6} onChange={(n) => set(r, 'A', n)} label={`${PASI_REGION_LABELS[r]} площадь`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check check--sm">
        <input type="checkbox" checked={child} onChange={(e) => setChild(e.target.checked)} />
        <span className="check__box" aria-hidden="true" />
        <span>Ребенок 0–7 лет (веса 0.2 / 0.2 / 0.3 / 0.3)</span>
      </label>
      <Result calc="EASI" score={score} max={72} sev={sev} onInsert={() => insertCalculator('EASI', { score, label: sev.label }, sev.level)} />
    </>
  );
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
function Uas7() {
  const [d, setD] = useState<[number, number][]>([[2, 2], [1, 2], [2, 1], [1, 1], [2, 2], [1, 1], [1, 2]]);
  const score = calcUas7(d);
  const sev = uas7Severity(score);
  const set = (i: number, k: 0 | 1, n: number) => setD((p) => p.map((x, j) => (j === i ? (k === 0 ? [n, x[1]] : [x[0], n]) : x)) as [number, number][]);
  return (
    <>
      <table className="calc__table">
        <thead><tr><th /><th title="Количество волдырей 0–3">Волдыри</th><th title="Интенсивность зуда 0–3">Зуд</th></tr></thead>
        <tbody>
          {DAYS.map((day, i) => (
            <tr key={day}>
              <th scope="row">{day}</th>
              <td><Num value={d[i][0]} max={3} onChange={(n) => set(i, 0, n)} label={`${day} волдыри`} /></td>
              <td><Num value={d[i][1]} max={3} onChange={(n) => set(i, 1, n)} label={`${day} зуд`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Result calc="UAS7" score={score} max={42} sev={sev} onInsert={() => insertCalculator('UAS7', { score, label: sev.label }, sev.level)} />
    </>
  );
}

export function Calculators() {
  const [tab, setTab] = useState<CalcKey>('PASI');
  const body = useMemo(() => ({ PASI: <Pasi />, SCORAD: <Scorad />, EASI: <Easi />, GAGS: <Gags />, DLQI: <Dlqi />, UAS7: <Uas7 /> }), []);
  return (
    <section className="panel" aria-label="Клинические калькуляторы">
      <div className="panel__head"><h2 className="panel__title">Калькуляторы</h2></div>
      <div className="calc__tabs">
        <Segmented<CalcKey> size="sm" options={(['PASI', 'SCORAD', 'EASI', 'GAGS', 'DLQI', 'UAS7'] as CalcKey[]).map((k) => ({ value: k, label: k }))} value={tab} onChange={setTab} />
      </div>
      <div className="calc">{body[tab]}</div>
    </section>
  );
}
