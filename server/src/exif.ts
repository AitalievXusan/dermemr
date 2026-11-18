// Удаление метаданных из изображений (SPEC §3.2, §7.2): GPS, модель устройства, автор.

/** JPEG: вырезаем сегменты APP1 (EXIF/XMP), APP2–APP15 и COM, оставляя APP0 (JFIF) и данные изображения. */
export function stripJpeg(buf: Buffer): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return buf; // поврежденный файл — не трогаем
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // начало сканирования — дальше данные
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); break; }
    const len = buf.readUInt16BE(i + 2);
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out);
}

/** PNG: удаляем текстовые и EXIF-чанки. */
export function stripPng(buf: Buffer): Buffer {
  const SIG = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== SIG) return buf;
  const drop = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('ascii');
    const end = i + 12 + len;
    if (!drop.has(type)) out.push(buf.subarray(i, end));
    i = end;
  }
  return Buffer.concat(out);
}

export function stripMetadata(buf: Buffer, mime: string): Buffer {
  if (mime === 'image/jpeg') return stripJpeg(buf);
  if (mime === 'image/png') return stripPng(buf);
  return buf;
}

export function sniffMime(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (buf.subarray(4, 12).toString('ascii').startsWith('ftypheic') || buf.subarray(4, 12).toString('ascii').startsWith('ftypmif1')) return 'image/heic';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
