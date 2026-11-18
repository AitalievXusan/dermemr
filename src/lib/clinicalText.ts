import type { DermatoscopyFinding, LesionType, Marker } from '../types';

// Чистые функции клинических формулировок — общие для UI, PDF-шаблонов и сервера.

export const LESION_LABELS: Record<LesionType, string> = {
  PLAQUE: 'Бляшка',
  PAPULE: 'Папула',
  VESICLE: 'Везикула',
  NEVUS: 'Невус',
  NEOPLASM_REMOVAL: 'Новообразование (удаление)',
};

/** Автоматическое связное описание дерматоскопии по чек-листу (PRD §4.3.1 O). */
export function dermatoscopyText(m: Marker, f: DermatoscopyFinding): string {
  const parts: string[] = [];
  if (f.network) parts.push(f.network === 'отсутствует' ? 'пигментная сеть не определяется' : `пигментная сеть ${f.network}`);
  if (f.dotsGlobules) parts.push(f.dotsGlobules === 'отсутствуют' ? 'точки и глобулы отсутствуют' : `${f.dotsGlobules} точки и глобулы`);
  if (f.streaks) parts.push('полосы (стрики) по периферии');
  if (f.vessels.length) parts.push(`сосудистый паттерн: ${f.vessels.join(', ')} сосуды`);
  if (f.blueWhiteVeil) parts.push('бело-голубая вуаль');
  if (f.miliaCysts) parts.push('милиумоподобные кисты');
  if (f.comedoOpenings) parts.push('комедоноподобные отверстия');
  const body = parts.length ? parts.join('; ') : 'структуры не отмечены';
  return `Очаг №${m.number} (${m.anatomyLabel.toLowerCase()}): ${body}.`;
}

export const morphologySentence = (p: string[], s: string[]) =>
  [p.length ? `Первичные элементы: ${p.join(', ')}` : '', s.length ? `вторичные: ${s.join(', ')}` : ''].filter(Boolean).join('; ') + (p.length || s.length ? '.' : '');

