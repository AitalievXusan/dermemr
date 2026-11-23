import { useId, useRef, useState, type MouseEvent, type SVGProps } from 'react';
import { addMarker, removeMarker, setProjection, updateMarker, useEnc } from '../../state';
import { Segmented } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { PROJECTIONS, PROJECTION_LABELS, type Shape } from './anatomy';
import { FigureArt, FigureClips } from './FigureArt';
import type { LesionType, Projection } from '../../types';
import { LESION_LABELS } from '../../lib/clinicalText';


function ShapeEl({ s, ...rest }: { s: Shape } & SVGProps<SVGElement>) {
  const p = rest as Record<string, unknown>;
  if (s.t === 'rect') return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 0} {...p} />;
  if (s.t === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...p} />;
  return <path d={s.d} {...p} />;
}

export function BodyMap({ large = false }: { large?: boolean }) {
  const projection = useEnc((s) => s.activeProjection);
  const markers = useEnc((s) => s.markers);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const def = PROJECTIONS[projection];
  const [vw, vh] = def.viewBox;
  const visible = markers.filter((m) => m.projection === projection);

  const onZoneClick = (e: MouseEvent<SVGElement>, code: string, label: string) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    addMarker(projection, Math.round((loc.x / vw) * 1000), Math.round((loc.y / vh) * 1000), code, label);
  };

  return (
    <section className="panel" aria-label="Карта тела">
      <div className="panel__head">
        <h2 className="panel__title">Карта тела</h2>
        <span className="panel__hint">{hover ?? 'Клик по зоне — маркер очага'}</span>
      </div>
      <Segmented<Projection>
        size="sm"
        ariaLabel="Проекция"
        options={(Object.keys(PROJECTION_LABELS) as Projection[]).map((p) => ({ value: p, label: PROJECTION_LABELS[p] }))}
        value={projection}
        onChange={setProjection}
      />
      <div className={`bodymap${large ? ' bodymap--large' : ''}`}>
        {def.caption && (
          <div className="bodymap__caption">
            <span>{def.caption[0]}</span>
            <span>{def.caption[1]}</span>
          </div>
        )}
        <div className="bodymap__stage" style={{ aspectRatio: `${vw} / ${vh}` }}>
          <svg ref={svgRef} viewBox={`0 0 ${vw} ${vh}`} className="bodymap__svg" role="img" aria-label={`Схема тела: ${PROJECTION_LABELS[projection]}`}>
            {def.figure && <FigureClips prefix={clipId} />}
            {def.figure && <FigureArt figure={def.figure} />}
            {def.zones.map((z) => (
              <ShapeEl
                key={z.code}
                s={z.shape}
                className={`bodymap__zone${def.figure ? ' bodymap__zone--overlay' : ''}`}
                transform={z.transform}
                clipPath={z.clip ? `url(#${clipId}-${z.clip})` : undefined}
                data-zone={z.code}
                onClick={(e: MouseEvent<SVGElement>) => onZoneClick(e, z.code, z.label)}
                onMouseEnter={() => setHover(z.label)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{z.label}</title>
              </ShapeEl>
            ))}
          </svg>
          {visible.map((m) => (
            <span key={m.id} className="marker mono" style={{ left: `${m.x / 10}%`, top: `${m.y / 10}%` }} title={m.anatomyLabel}>
              {m.number}
            </span>
          ))}
        </div>
      </div>

      {markers.length > 0 && (
        <ul className="markers">
          {[...markers].sort((a, b) => a.number - b.number).map((m) => (
            <li key={m.id} className={`markers__row${m.projection === projection ? '' : ' is-other'}`}>
              <button type="button" className="marker marker--static mono" onClick={() => setProjection(m.projection)} title={`Показать на проекции «${PROJECTION_LABELS[m.projection]}»`}>
                {m.number}
              </button>
              <span className="markers__label">{m.anatomyLabel}</span>
              <select
                className="select select--xs"
                value={m.lesionType}
                onChange={(e) => updateMarker(m.id, { lesionType: e.target.value as LesionType })}
                aria-label={`Тип элемента очага ${m.number}`}
              >
                {(Object.keys(LESION_LABELS) as LesionType[]).map((t) => (
                  <option key={t} value={t}>{LESION_LABELS[t]}</option>
                ))}
              </select>
              <button type="button" className="icon-btn" onClick={() => removeMarker(m.id)} aria-label={`Удалить маркер ${m.number}`}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
