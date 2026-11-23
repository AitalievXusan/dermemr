import { FIG, FIG_BACK, FIG_FRONT, HANDS_FEET, type ExtEl, type FigKind } from './figure';

/** Цвета силуэта: в интерфейсе — CSS-переменные темы, в PDF — фиксированные значения. */
export interface FigurePalette {
  skin: string;
  ink: string;
  det: string;
  hair: string;
  nail: string;
}

export const SCREEN_PALETTE: FigurePalette = {
  skin: 'var(--bg-surface-secondary)',
  ink: 'var(--text-primary)',
  det: 'var(--text-muted)',
  hair: 'var(--border-subtle)',
  nail: 'var(--bg-surface-primary)',
};

export const PRINT_PALETTE: FigurePalette = { skin: '#efeae1', ink: '#19382c', det: '#8a9a92', hair: '#cfc5b6', nail: '#fcfbf8' };

const detailStyle = (k: FigKind, p: FigurePalette) => {
  if (k === 'hair') return { fill: p.hair, stroke: 'none' };
  if (k === 'dot') return { fill: p.det, stroke: p.det, strokeWidth: 1 };
  if (k === 'part') return { fill: 'none', stroke: p.det, strokeWidth: 1, opacity: 0.6 };
  if (k === 'spine') return { fill: 'none', stroke: p.det, strokeWidth: 1.2, strokeDasharray: '3 4', strokeLinecap: 'round' as const };
  return { fill: 'none', stroke: p.det, strokeWidth: 1.2, strokeLinecap: 'round' as const };
};

function ExtShape({ e, p }: { e: ExtEl; p: FigurePalette }) {
  if (e.tag === 'text') {
    const t = e.a as { x: number; y: number; t: string; anchor: 'start' | 'middle' | 'end' };
    return (
      <text x={t.x} y={t.y} textAnchor={t.anchor} style={e.k === 'cap' ? { fill: p.ink, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em' } : { fill: p.det, fontSize: 12 }} fontFamily="Geist, Inter, Arial, sans-serif">
        {t.t}
      </text>
    );
  }
  const style =
    e.k === 'skin' ? { fill: p.skin, stroke: p.ink, strokeWidth: 1.6 }
    : e.k === 'nail' ? { fill: p.nail, stroke: p.det, strokeWidth: 1.1 }
    : e.k === 'dot' ? { fill: p.det }
    : e.k === 'line' ? { fill: 'none', stroke: p.ink, strokeWidth: 1.6 }
    : e.k === 'dash' ? { fill: 'none', stroke: p.det, strokeWidth: 1.2, strokeDasharray: '3 4' }
    : { fill: 'none', stroke: p.det, strokeWidth: 1.2, opacity: 0.7, strokeLinecap: 'round' as const };
  const a = e.a as Record<string, number> & { d: string };
  const common = { style, transform: e.tf };
  if (e.tag === 'rect') return <rect x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} {...common} />;
  if (e.tag === 'ellipse') return <ellipse cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} {...common} />;
  if (e.tag === 'circle') return <circle cx={a.cx} cy={a.cy} r={a.r} {...common} />;
  return <path d={a.d} {...common} />;
}

/** Силуэт для clipPath: зона-«пояс» (грудь, бедро…) закрашивается только в пределах тела. */
export function FigureClips({ prefix }: { prefix: string }) {
  return (
    <defs>
      <clipPath id={`${prefix}-body`}><path d={FIG.body} /></clipPath>
      <clipPath id={`${prefix}-armL`}><path d={FIG.armL} /></clipPath>
      <clipPath id={`${prefix}-armR`}><path d={FIG.armR} /></clipPath>
    </defs>
  );
}

/** Антропоморфная подложка карты тела: спереди — лицо, ключицы, пупок; сзади — затылок, лопатки, позвоночник. */
export function FigureArt({ figure, palette = SCREEN_PALETTE }: { figure: 'FRONT' | 'BACK' | 'HANDS_FEET'; palette?: FigurePalette }) {
  const p = palette;
  if (figure === 'HANDS_FEET') {
    return <g aria-hidden="true" style={{ pointerEvents: 'none' }}>{HANDS_FEET.map((e, i) => <ExtShape key={i} e={e} p={p} />)}</g>;
  }
  const skin = { fill: p.skin, stroke: p.ink, strokeWidth: 1.6, strokeLinejoin: 'round' as const };
  const details = figure === 'FRONT' ? FIG_FRONT : FIG_BACK;
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <path d={FIG.armL} style={skin} />
      <path d={FIG.armR} style={skin} />
      <path d={FIG.body} style={skin} />
      <path d="M 92 58 L 92 76 M 108 58 L 108 76" style={{ fill: 'none', stroke: p.ink, strokeWidth: 1.6 }} />
      <path d={FIG.head} style={skin} />
      {details.map(([k, d], i) => <path key={i} d={d} style={detailStyle(k, p)} />)}
    </g>
  );
}
