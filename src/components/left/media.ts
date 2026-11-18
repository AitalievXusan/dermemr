import { createStore, uid, useStore } from '../../lib/store';

// Фотоархив визита (SPEC §2.1 encounter_media). Хранится отдельно от черновика SOAP,
// чтобы не клонировать тяжелые dataURL при каждом изменении протокола.
export interface MediaItem {
  id: string;
  markerId: string | null;
  date: string;
  kind: 'MACRO_PHOTO' | 'DERMATOSCOPY';
  url: string;
  demo?: boolean;
  includeInPdf: boolean;
  encounterId?: string;
}

export const media = createStore<{ items: MediaItem[]; selectedMarker: string | null }>({ items: [], selectedMarker: 'mk_1' });
export const useMedia = <S,>(sel: (s: { items: MediaItem[]; selectedMarker: string | null }) => S) => useStore(media, sel);

/** Процедурный демо-снимок бляшки (вместо реальных фото пациента). */
function demoPlaque(seed: number, severity: number): string {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#e3bfa3';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${150 + rnd() * 60},${100 + rnd() * 40},${80 + rnd() * 30},${0.05 + rnd() * 0.06})`;
    g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2);
  }
  const rx = 90 + severity * 70;
  const ry = 60 + severity * 50;
  const grd = g.createRadialGradient(240, 180, 10, 240, 180, rx);
  grd.addColorStop(0, `rgba(${170 + severity * 30},${70 - severity * 20},${70 - severity * 15},${0.55 + severity * 0.35})`);
  grd.addColorStop(0.75, `rgba(200,100,95,${0.3 + severity * 0.3})`);
  grd.addColorStop(1, 'rgba(227,191,163,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(240, 180, rx, ry, -0.2, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 260 * severity + 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    g.fillStyle = `rgba(245,240,232,${0.35 + rnd() * 0.4})`;
    g.beginPath();
    g.ellipse(240 + Math.cos(a) * r * rx * 0.85, 180 + Math.sin(a) * r * ry * 0.85, 2 + rnd() * 5, 1 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.font = '500 13px monospace';
  g.fillText('ДЕМО-СНИМОК', 14, 344);
  return c.toDataURL('image/jpeg', 0.85);
}

export function seedDemoMedia() {
  if (media.get().items.length) return;
  media.set((m) => {
    m.items.push(
      { id: uid('m'), markerId: 'mk_1', date: '2026-10-21', kind: 'MACRO_PHOTO', url: demoPlaque(7, 1), demo: true, includeInPdf: false },
      { id: uid('m'), markerId: 'mk_1', date: '2026-11-18', kind: 'MACRO_PHOTO', url: demoPlaque(11, 0.45), demo: true, includeInPdf: true },
      { id: uid('m'), markerId: 'mk_2', date: '2026-11-18', kind: 'DERMATOSCOPY', url: demoPlaque(23, 0.7), demo: true, includeInPdf: true },
    );
  });
}

export function addUpload(file: File, markerId: string | null) {
  const reader = new FileReader();
  reader.onload = () =>
    media.set((m) => {
      m.items.push({ id: uid('m'), markerId, date: new Date().toISOString().slice(0, 10), kind: 'MACRO_PHOTO', url: String(reader.result), includeInPdf: true });
    });
  reader.readAsDataURL(file);
}
