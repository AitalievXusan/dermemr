import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
import type { Browser } from 'puppeteer-core';

// PDF-движок: Headless Chromium через puppeteer-core (SPEC §1.2). Браузер не скачивается —
// используется установленный Chrome или Microsoft Edge (есть в каждой Windows 10/11).

function candidates(): string[] {
  const list = [config.pdfBrowserPath];
  const e = process.env;
  if (process.platform === 'win32') {
    const roots = [e['PROGRAMFILES'], e['PROGRAMFILES(X86)'], e['LOCALAPPDATA']].filter(Boolean) as string[];
    for (const r of roots) {
      list.push(join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      list.push(join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      list.push(join(r, 'Chromium', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    list.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium');
  }
  return list.filter(Boolean);
}

export const browserPath = (): string | null => candidates().find((p) => existsSync(p)) ?? null;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  const path = browserPath();
  if (!path) throw new Error('Не найден Chrome / Edge для генерации PDF. Укажите PDF_BROWSER_PATH в .env');
  if (!browserPromise) {
    const puppeteer = (await import('puppeteer-core')).default;
    browserPromise = puppeteer.launch({
      executablePath: path,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
    });
    browserPromise.then((b) => b.on('disconnected', () => (browserPromise = null))).catch(() => (browserPromise = null));
  }
  return browserPromise;
}

/** A4 — стандартный лист; Mobile — 390pt по ширине и динамическая высота одной страницей. */
export async function htmlToPdf(html: string, kind: 'A4' | 'MOBILE'): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: kind === 'A4' ? 794 : 520, height: 1000 });
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    // шрифты с Google Fonts: ждем, но не дольше 4 с (офлайн — запасные шрифты)
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]));
    if (kind === 'A4') {
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    }
    const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    return Buffer.from(await page.pdf({ width: '520px', height: `${height + 2}px`, printBackground: true, pageRanges: '1' }));
  } finally {
    await page.close();
  }
}

export async function closePdfEngine() {
  if (browserPromise) (await browserPromise).close().catch(() => undefined);
}

/** Прогрев движка при старте, чтобы первое «Сформировать документы» укладывалось в SLA. */
export function warmUpPdfEngine() {
  if (browserPath()) getBrowser().catch((e) => console.warn('  PDF: не удалось запустить браузер —', e.message));
}
