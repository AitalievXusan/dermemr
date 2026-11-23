import { PROJECTIONS, type Shape } from '../left/anatomy';
import { FigureArt, PRINT_PALETTE } from '../left/FigureArt';
import type { Projection } from '../../types';

function ShapeEl({ s }: { s: Shape }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1 };
  if (s.t === 'rect') return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 0} {...p} />;
  if (s.t === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...p} />;
  return <path d={s.d} {...p} />;
}

/** Статичная схема для PDF и превью. */
export function BodySilhouette({ projection, markers, className }: { projection: Projection; markers: { number: number; x: number; y: number }[]; className?: string }) {
  const def = PROJECTIONS[projection];
  const [vw, vh] = def.viewBox;
  return (
    <svg className={className} viewBox={`0 0 ${vw} ${vh}`}>
      {def.figure ? <FigureArt figure={def.figure} palette={PRINT_PALETTE} /> : def.zones.map((z) => <ShapeEl key={z.code} s={z.shape} />)}
      {markers.map((m) => (
        <g key={m.number}>
          <circle cx={(m.x / 1000) * vw} cy={(m.y / 1000) * vh} r={11} fill="#1B3B2E" />
          <text x={(m.x / 1000) * vw} y={(m.y / 1000) * vh + 4} textAnchor="middle" fontSize="12" fill="#fff" fontFamily="JetBrains Mono, monospace">
            {m.number}
          </text>
        </g>
      ))}
    </svg>
  );
}

