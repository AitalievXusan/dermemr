import type { Projection } from '../../types';

// Векторные анатомические зоны Body Map. Координаты в системе viewBox каждой проекции.
export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'path'; d: string };

export interface Zone {
  code: string;
  label: string;
  shape: Shape;
}

export interface ProjectionDef {
  viewBox: [number, number];
  zones: Zone[];
  caption?: [string, string]; // подписи сторон
}

const W = 200;
const mirrorRect = (s: Extract<Shape, { t: 'rect' }>): Shape => ({ ...s, x: W - s.x - s.w });

/** Конечности: [код, подпись] для правой стороны пациента, фигура для правой стороны. */
const LIMBS: { code: string; right: string; left: string; shape: Extract<Shape, { t: 'rect' }>; backRight?: string; backLeft?: string }[] = [
  { code: 'SHOULDER', right: 'Правое плечо', left: 'Левое плечо', shape: { t: 'rect', x: 37, y: 84, w: 22, h: 82, r: 10 } },
  { code: 'ELBOW', right: 'Правый локтевой сгиб', left: 'Левый локтевой сгиб', backRight: 'Правый локоть (разгибательная поверхность)', backLeft: 'Левый локоть (разгибательная поверхность)', shape: { t: 'rect', x: 33, y: 167, w: 22, h: 14, r: 6 } },
  { code: 'FOREARM', right: 'Правое предплечье', left: 'Левое предплечье', shape: { t: 'rect', x: 30, y: 182, w: 22, h: 64, r: 10 } },
  { code: 'HAND', right: 'Правая кисть (ладонь)', left: 'Левая кисть (ладонь)', backRight: 'Правая кисть (тыл)', backLeft: 'Левая кисть (тыл)', shape: { t: 'rect', x: 28, y: 248, w: 24, h: 34, r: 10 } },
  { code: 'THIGH', right: 'Правое бедро', left: 'Левое бедро', shape: { t: 'rect', x: 68, y: 249, w: 31, h: 80, r: 12 } },
  { code: 'KNEE', right: 'Правое колено', left: 'Левое колено', backRight: 'Правая подколенная ямка', backLeft: 'Левая подколенная ямка', shape: { t: 'rect', x: 69, y: 330, w: 29, h: 18, r: 8 } },
  { code: 'SHIN', right: 'Правая голень', left: 'Левая голень', shape: { t: 'rect', x: 70, y: 349, w: 27, h: 58, r: 10 } },
  { code: 'FOOT', right: 'Правая стопа (тыл)', left: 'Левая стопа (тыл)', backRight: 'Правая пятка', backLeft: 'Левая пятка', shape: { t: 'rect', x: 66, y: 409, w: 31, h: 18, r: 8 } },
];

function bodyProjection(side: 'FRONT' | 'BACK'): ProjectionDef {
  const front = side === 'FRONT';
  const zones: Zone[] = [
    { code: 'HEAD', label: front ? 'Лицо' : 'Затылочная область (ВЧГ)', shape: { t: 'ellipse', cx: 100, cy: 38, rx: 20, ry: 26 } },
    { code: 'NECK', label: front ? 'Передняя поверхность шеи' : 'Задняя поверхность шеи', shape: { t: 'rect', x: 91, y: 64, w: 18, h: 15, r: 4 } },
    { code: 'TORSO_UP', label: front ? 'Грудь' : 'Верхняя часть спины', shape: { t: 'path', d: 'M62 82 Q100 74 138 82 L135 150 L65 150 Z' } },
    { code: 'TORSO_MID', label: front ? 'Живот' : 'Поясничная область', shape: { t: 'rect', x: 65, y: 151, w: 70, h: 62, r: 2 } },
    { code: 'PELVIS', label: front ? 'Паховая область' : 'Ягодичная область', shape: { t: 'path', d: 'M65 214 L135 214 L133 247 L67 247 Z' } },
  ];
  LIMBS.forEach((l) => {
    // На передней проекции правая сторона пациента — слева от зрителя; на задней — наоборот.
    const rightLabel = front ? l.right : l.backRight ?? l.right;
    const leftLabel = front ? l.left : l.backLeft ?? l.left;
    zones.push({ code: `${l.code}_R`, label: rightLabel, shape: front ? l.shape : mirrorRect(l.shape) });
    zones.push({ code: `${l.code}_L`, label: leftLabel, shape: front ? mirrorRect(l.shape) : l.shape });
  });
  return {
    viewBox: [200, 440],
    zones: zones.map((z) => ({ ...z, code: `${side}_${z.code}` })),
    caption: front ? ['Пр', 'Лев'] : ['Лев', 'Пр'],
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

function handDef(): ProjectionDef {
  const zones: Zone[] = [];
  const fingers = ['I', 'II', 'III', 'IV', 'V'];
  // Тыльная проекция, большие пальцы обращены к центру схемы.
  const TOPS = [0, 56, 46, 52, 66]; // верх пальцев I..V (I — большой, задается отдельно)
  const hand = (side: 'R' | 'L', ox: number) => {
    const gen = side === 'R' ? 'правой кисти' : 'левой кисти';
    zones.push({ code: `HAND_${side}_DORSUM`, label: side === 'R' ? 'Правая кисть (тыл)' : 'Левая кисть (тыл)', shape: { t: 'rect', x: ox + 12, y: 112, w: 62, h: 78, r: 12 } });
    const order = side === 'L' ? [5, 4, 3, 2] : [2, 3, 4, 5];
    order.forEach((f, pos) => {
      const x = ox + 13 + pos * 15;
      const y = TOPS[f - 1];
      zones.push({ code: `HAND_${side}_F${f}`, label: `${fingers[f - 1]} палец ${gen}`, shape: { t: 'rect', x, y, w: 13, h: 114 - y, r: 6 } });
      zones.push({ code: `NAIL_${side}_F${f}`, label: `Ногтевая пластина ${fingers[f - 1]} пальца ${gen}`, shape: { t: 'rect', x: x + 2.5, y: y + 2, w: 8, h: 11, r: 3 } });
    });
    const tx = side === 'L' ? ox + 76 : ox - 3;
    zones.push({ code: `HAND_${side}_F1`, label: `I палец ${gen}`, shape: { t: 'rect', x: tx, y: 124, w: 13, h: 46, r: 6 } });
    zones.push({ code: `NAIL_${side}_F1`, label: `Ногтевая пластина I пальца ${gen}`, shape: { t: 'rect', x: tx + 2.5, y: 126, w: 8, h: 11, r: 3 } });
  };
  hand('L', 10);
  hand('R', 108);
  return { viewBox: [200, 240], zones, caption: ['Лев', 'Пр'] };
}

export const PROJECTIONS: Record<Projection, ProjectionDef> = {
  FRONT: bodyProjection('FRONT'),
  BACK: bodyProjection('BACK'),
  HEAD_FACE: face,
  HANDS_FEET: handDef(),
};

export const PROJECTION_LABELS: Record<Projection, string> = {
  FRONT: 'Перед',
  BACK: 'Зад',
  HEAD_FACE: 'Лицо/ВЧГ',
  HANDS_FEET: 'Кисти/Ногти',
};
