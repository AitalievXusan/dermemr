// Стили PDF-шаблонов (DESIGN §7). Один и тот же CSS используется в предпросмотре,
// при печати из браузера и (в проде) в Headless Chromium-сервисе генерации.
export const DOC_FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap';

export const DOC_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#141A17;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,'Geist',-apple-system,sans-serif}
.mono{font-family:'JetBrains Mono','IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.serif{font-family:Newsreader,Georgia,serif}
.avoid{break-inside:avoid;page-break-inside:avoid}

/* ---------- A4 ---------- */
.a4{width:210mm;min-height:297mm;padding:15mm 18mm;font-size:9.5pt;line-height:1.4;position:relative}
.a4+.a4{break-before:page;page-break-before:always}
.a4__clinic{display:grid;grid-template-columns:1fr auto;gap:6mm;padding-bottom:3mm;border-bottom:.75pt solid #1B3B2E}
.a4__clinic-name{font-family:Newsreader,Georgia,serif;font-weight:700;font-size:16pt;color:#1B3B2E;line-height:1.15}
.a4__clinic-meta{font-size:8pt;color:#4A6358;margin-top:1mm}
.a4__title{font-family:Newsreader,Georgia,serif;font-weight:700;font-size:16pt;color:#1B3B2E;margin:6mm 0 4mm}
.a4__passport{display:grid;grid-template-columns:repeat(12,1fr);gap:1.5mm 4mm;border:.5pt solid #DFD8CE;padding:3mm 4mm;margin-bottom:5mm}
.a4__passport > div{grid-column:span 4}
.a4__passport > .w8{grid-column:span 8}
.a4__k{display:block;font-size:7.5pt;color:#4A6358;text-transform:uppercase;letter-spacing:.06em}
.a4 h2{font-size:9pt;font-weight:600;color:#1B3B2E;text-transform:uppercase;letter-spacing:.06em;padding-bottom:1.5mm;border-bottom:.75pt solid #1B3B2E;margin:5mm 0 2.5mm}
.a4 p{margin-bottom:1.5mm}
.a4 .lbl{font-weight:600}
.a4__status{display:grid;grid-template-columns:1fr 52mm;gap:6mm}
.a4__map{display:flex;gap:2mm;color:#1B3B2E}
.a4__map svg{width:25mm;height:auto}
.a4__photos{display:flex;gap:3mm;flex-wrap:wrap;margin-top:3mm}
.a4__photo{width:35mm}
.a4__photo img{width:35mm;height:35mm;object-fit:cover;display:block;border:.5pt solid #E2E2E2;background:#242524}
.a4__photo span{font-size:7.5pt;color:#4A6358}
.a4__dx{font-size:10.5pt}
.a4 table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:1mm}
.a4 th{text-align:left;font-weight:600;color:#1B3B2E;border-bottom:.75pt solid #1B3B2E;padding:1.5mm 2mm 1.5mm 0}
.a4 td{border-bottom:.5pt solid #DFD8CE;padding:1.8mm 2mm 1.8mm 0;vertical-align:top}
.a4 td.c,.a4 th.c{text-align:center;width:11mm}
.a4__foot{display:grid;grid-template-columns:1fr 1fr auto;gap:6mm;align-items:end;margin-top:10mm;padding-top:4mm;border-top:.75pt solid #1B3B2E}
.a4__sign{border-bottom:.5pt solid #141A17;height:12mm;margin-bottom:1mm}
.a4__ukep{border:.75pt solid #1B3B2E;padding:2mm 3mm;font-size:7.5pt;color:#1B3B2E;line-height:1.35}
.qr{display:block}
.qr-cap{font-size:6.5pt;color:#4A6358;text-align:center;margin-top:1mm}
.rx-blank{border:.75pt solid #1B3B2E;padding:6mm;width:148mm;margin:0 auto 8mm}
.rx-blank h3{font-family:Newsreader,Georgia,serif;font-size:13pt;color:#1B3B2E;text-align:center;margin-bottom:4mm}
.rx-blank .row{display:flex;gap:3mm;border-bottom:.5pt solid #DFD8CE;padding:1.5mm 0}
.rx-blank .row .k{width:38mm;color:#4A6358;font-size:8pt}
.rx-blank .rp{margin:4mm 0;font-size:10pt;line-height:1.6}

/* ---------- Mobile (390pt) ---------- */
.mob{width:390pt;padding:16pt;font-size:14.5pt;line-height:1.5;color:#141A17}
.mob__head{padding-bottom:12pt;border-bottom:1pt solid #DFD8CE;margin-bottom:14pt}
.mob__clinic{font-size:11pt;color:#4A6358;display:flex;justify-content:space-between}
.mob__title{font-family:Newsreader,Georgia,serif;font-weight:700;font-size:20pt;color:#1B3B2E;line-height:1.2;margin:8pt 0 2pt}
.mob__who{font-size:12pt;color:#4A6358}
.mob__dx{border:1.5pt solid #1B3B2E;border-radius:8pt;padding:12pt 14pt;margin-bottom:16pt}
.mob__dx-k{font-size:11pt;color:#4A6358;text-transform:uppercase;letter-spacing:.06em}
.mob__dx-name{font-family:Newsreader,Georgia,serif;font-weight:700;font-size:18pt;color:#1B3B2E;line-height:1.25;margin:2pt 0 6pt}
.mob h2{font-size:15pt;font-weight:600;color:#1B3B2E;padding-bottom:4pt;border-bottom:1pt solid #DFD8CE;margin:18pt 0 10pt}
.mob__slot{border-left:2.5pt solid #1B3B2E;padding:2pt 0 2pt 12pt;margin-bottom:14pt}
.mob__slot-name{font-size:12pt;font-weight:600;letter-spacing:.08em;color:#1B3B2E}
.mob__step{display:grid;grid-template-columns:22pt 1fr;gap:8pt;padding:7pt 0;border-bottom:.75pt solid #EFEAE1}
.mob__step:last-child{border-bottom:0}
.mob__step svg{width:20pt;height:20pt;color:#1B3B2E;margin-top:2pt}
.mob__step-title{font-weight:600;font-size:14.5pt}
.mob__step-title .dose{font-size:16pt}
.mob__step-detail{font-size:13.5pt;color:#3A4A43}
.mob__rule{border:1pt solid #1B3B2E;border-radius:8pt;padding:12pt 14pt;margin-bottom:10pt}
.mob__rule p+p{margin-top:6pt}
.mob__list li{margin:0 0 6pt 18pt}
.mob__btn{display:block;text-align:center;text-decoration:none;font-weight:600;font-size:15pt;color:#fff;background:#1B3B2E;border-radius:8pt;padding:12pt;margin:10pt 0}
.mob__btn--ghost{color:#1B3B2E;background:transparent;border:1.5pt solid #1B3B2E}
.mob__foot{margin-top:16pt;padding-top:10pt;border-top:1pt solid #DFD8CE;font-size:11.5pt;color:#4A6358}
.mob__badge{display:inline-block;border:1pt solid #1B3B2E;color:#1B3B2E;border-radius:999pt;padding:3pt 10pt;font-size:11pt;font-weight:600;margin-bottom:6pt}
.mob__map{display:flex;justify-content:center;gap:12pt;color:#1B3B2E;margin:6pt 0}
.mob__map svg{width:110pt;height:auto}
.mob__legend li{list-style:none;margin-bottom:4pt}

@media print{
  @page{margin:0}
  .a4{min-height:auto}
}
`;
