import type { Projection } from '../../types';
import { HANDS_FEET } from './figure';

// Векторные анатомические зоны Body Map. Координаты в системе viewBox каждой проекции.
export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'path'; d: string };

export interface Zone {
  code: string;
  label: string;
  shape: Shape;
  /** Обрезка по силуэту: зона-«пояс» видна только внутри тела или руки. */
  clip?: 'body' | 'armL' | 'armR';
  transform?: string;
}

export interface ProjectionDef {
  viewBox: [number, number];
  zones: Zone[];
  caption?: [string, string]; // подписи сторон
  /** Антропоморфная подложка (силуэт, детали); зоны поверх неё прозрачные. */
  figure?: 'FRONT' | 'BACK' | 'HANDS_FEET';
}

const W = 200;
const mirrorRect = (s: Extract<Shape, { t: 'rect' }>): Shape => ({ ...s, x: W - s.x - s.w });

/** Конечности: [код, подпись] для правой стороны пациента; фигура — для левой половины схемы (viewBox 200×430). */
const LIMBS: { code: string; right: string; left: string; shape: Extract<Shape, { t: 'rect' }>; arm?: boolean; backRight?: string; backLeft?: string }[] = [
  { code: 'SHOULDER', right: 'Правое плечо', left: 'Левое плечо', arm: true, shape: { t: 'rect', x: 6, y: 84, w: 66, h: 78 } },
  { code: 'ELBOW', right: 'Правый локтевой сгиб', left: 'Левый локтевой сгиб', backRight: 'Правый локоть (разгибательная поверхность)', backLeft: 'Левый локоть (разгибательная поверхность)', arm: true, shape: { t: 'rect', x: 6, y: 162, w: 66, h: 18 } },
  { code: 'FOREARM', right: 'Правое предплечье', left: 'Левое предплечье', arm: true, shape: { t: 'rect', x: 6, y: 180, w: 66, h: 56 } },
  { code: 'HAND', right: 'Правая кисть (ладонь)', left: 'Левая кисть (ладонь)', backRight: 'Правая кисть (тыл)', backLeft: 'Левая кисть (тыл)', arm: true, shape: { t: 'rect', x: 6, y: 236, w: 66, h: 38 } },
  { code: 'THIGH', right: 'Правое бедро', left: 'Левое бедро', shape: { t: 'rect', x: 56, y: 250, w: 44, h: 40 } },
  { code: 'KNEE', right: 'Правое колено', left: 'Левое колено', backRight: 'Правая подколенная ямка', backLeft: 'Левая подколенная ямка', shape: { t: 'rect', x: 56, y: 290, w: 44, h: 22 } },
  { code: 'SHIN', right: 'Правая голень', left: 'Левая голень', shape: { t: 'rect', x: 56, y: 312, w: 44, h: 82 } },
  { code: 'FOOT', right: 'Правая стопа (тыл)', left: 'Левая стопа (тыл)', backRight: 'Правая пятка', backLeft: 'Левая пятка', shape: { t: 'rect', x: 56, y: 394, w: 44, h: 26 } },
];

function bodyProjection(side: 'FRONT' | 'BACK'): ProjectionDef {
  const front = side === 'FRONT';
  const zones: Zone[] = [
    { code: 'HEAD', label: front ? 'Лицо' : 'Затылочная область (ВЧГ)', shape: { t: 'path', d: 'M 100 8 C 115 8 124 20 124 36 C 124 52 116 64 100 64 C 84 64 76 52 76 36 C 76 20 85 8 100 8 Z' } },
    { code: 'NECK', label: front ? 'Передняя поверхность шеи' : 'Задняя поверхность шеи', clip: 'body', shape: { t: 'rect', x: 84, y: 58, w: 32, h: 22 } },
    { code: 'TORSO_UP', label: front ? 'Грудь' : 'Верхняя часть спины', clip: 'body', shape: { t: 'rect', x: 50, y: 80, w: 100, h: 70 } },
    { code: 'TORSO_MID', label: front ? 'Живот' : 'Поясничная область', clip: 'body', shape: { t: 'rect', x: 50, y: 150, w: 100, h: 58 } },
    { code: 'PELVIS', label: front ? 'Паховая область' : 'Ягодичная область', clip: 'body', shape: { t: 'rect', x: 50, y: 208, w: 100, h: 42 } },
  ];
  LIMBS.forEach((l) => {
    // На передней проекции правая сторона пациента — слева от зрителя; на задней — наоборот.
    const rightLabel = front ? l.right : l.backRight ?? l.right;
    const leftLabel = front ? l.left : l.backLeft ?? l.left;
    const viewerLeft = { shape: l.shape as Shape, clip: l.arm ? ('armL' as const) : ('body' as const) };
    const viewerRight = { shape: mirrorRect(l.shape), clip: l.arm ? ('armR' as const) : ('body' as const) };
    zones.push({ code: `${l.code}_R`, label: rightLabel, ...(front ? viewerLeft : viewerRight) });
    zones.push({ code: `${l.code}_L`, label: leftLabel, ...(front ? viewerRight : viewerLeft) });
  });
  return {
    viewBox: [200, 430],
    zones: zones.map((z) => ({ ...z, code: `${side}_${z.code}` })),
    caption: front ? ['Пр', 'Лев'] : ['Лев', 'Пр'],
    figure: side,
  };
}

const face: ProjectionDef = {
  viewBox: [200, 240],
  caption: ['Пр', 'Лев'],
  zones: [
    { code: 'HEAD_SCALP', label: 'Волосистая часть головы', shape: { t: 'path', d: 'M42 92 Q44 22 100 18 Q156 22 158 92 Q130 70 100 70 Q70 70 42 92 Z' } },
    { code: 'HEAD_FOREHEAD', label: 'Лоб', shape: { t: 'path', d: 'M44 96 Q70 74 100 74 Q130 74 156 96 L154 112 L46 112 Z' } },
    { code: 'HEAD_R_CHEEK', label: 'Правая щека', shape: { t: 'path', d: 'M46 114 L86 114 L86 168 Q60 162 52 150 Q44 134 46 114 Z' } },
    { code: 'HEAD_L_CHEEK', label: 'Левая щека', shape: { t: 'path', d: 'M154 114 L114 114 L114 168 Q140 162 148 150 Q156 134 154 114 Z' } },
    { code: 'HEAD_NOSE', label: 'Нос', shape: { t: 'path', d: 'M88 114 L112 114 L114 152 L86 152 Z' } },
    { code: 'HEAD_PERIORAL', label: 'Периоральная область', shape: { t: 'path', d: 'M86 154 L114 154 L116 176 L84 176 Z' } },
    { code: 'HEAD_CHIN', label: 'Подбородок', shape: { t: 'path', d: 'M60 166 Q72 172 84 178 L116 178 Q128 172 140 166 Q128 196 100 200 Q72 196 60 166 Z' } },
    { code: 'HEAD_NECK', label: 'Шея', shape: { t: 'rect', x: 76, y: 202, w: 48, h: 32, r: 4 } },
  ],
};

function handsFeetDef(): ProjectionDef {
  const zones: Zone[] = HANDS_FEET.filter((e) => e.z).map((e) => {
    const a = e.a as Record<string, number> & { d: string };
    const shape: Shape =
      e.tag === 'rect' ? { t: 'rect', x: a.x, y: a.y, w: a.width, h: a.height, r: a.rx }
      : e.tag === 'ellipse' ? { t: 'ellipse', cx: a.cx, cy: a.cy, rx: a.rx, ry: a.ry }
      : { t: 'path', d: a.d };
    return { code: e.z!.code, label: e.z!.label, shape, transform: e.tf };
  });
  return { viewBox: [360, 530], zones, caption: ['Лев', 'Пр'], figure: 'HANDS_FEET' };
}

export const PROJECTIONS: Record<Projection, ProjectionDef> = {
  FRONT: bodyProjection('FRONT'),
  BACK: bodyProjection('BACK'),
  HEAD_FACE: face,
  HANDS_FEET: handsFeetDef(),
};

export const PROJECTION_LABELS: Record<Projection, string> = {
  FRONT: 'Перед',
  BACK: 'Зад',
  HEAD_FACE: 'Лицо/ВЧГ',
  HANDS_FEET: 'Кисти/Стопы',
};
