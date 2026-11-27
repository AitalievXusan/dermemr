// Копирует PDF протоколов и стандартов МЗ РУз из папки guidelines/ в public/guidelines/
// под латинскими именами (pdfSlug в src/lib/guidelines.ts — та же функция): так ссылки
// одинаково открываются и на компьютере, и в облаке (Vercel отдаёт public/ как статику).
// Запуск: node scripts/copy-guidelines.mjs [папка-с-pdf]
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MAP = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'u', қ: 'q', ғ: 'g', ҳ: 'h' };
export function pdfSlug(file) {
  const base = file.replace(/\.pdf$/i, '').toLowerCase();
  const lat = [...base].map((ch) => (ch in MAP ? MAP[ch] : ch)).join('');
  return `${lat.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'doc'}.pdf`;
}

const src = process.argv[2] || 'guidelines';
const dst = 'public/guidelines';
if (!existsSync(src)) throw new Error(`Нет папки ${src}`);
mkdirSync(dst, { recursive: true });
const seen = new Map();
for (const f of readdirSync(src).filter((x) => /\.pdf$/i.test(x))) {
  const s = pdfSlug(f);
  if (seen.has(s)) throw new Error(`Одинаковое имя ${s}: ${seen.get(s)} и ${f}`);
  seen.set(s, f);
  copyFileSync(join(src, f), join(dst, s));
}
console.log(`Скопировано ${seen.size} PDF → ${dst}`);
