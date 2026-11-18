// Серверные страницы: мобильная загрузка фото по QR (SPEC §3.2) и проверка подлинности документа.

const BASE_CSS = `
*{box-sizing:border-box}body{margin:0;background:#F7F4EF;color:#19382C;font:400 15px/1.45 -apple-system,'Segoe UI',Inter,sans-serif}
.wrap{max-width:480px;margin:0 auto;padding:20px 16px 40px}
h1{font:500 22px/1.25 Georgia,'Newsreader',serif;margin:0 0 4px}
.muted{color:#7B8C84;font-size:13px}
.card{background:#FCFBF8;border:1px solid #DFD8CE;border-radius:8px;padding:14px;margin-top:14px}
label{display:block;font-size:13px;color:#4A6358;margin-bottom:6px}
select,button{width:100%;height:44px;border-radius:6px;font:inherit}
select{border:1px solid #DFD8CE;background:#fff;padding:0 10px}
button{border:0;background:#C9827B;color:#FCFBF8;font-weight:600;margin-top:12px}
button.ghost{background:transparent;border:1.5px solid #19382C;color:#19382C}
button:disabled{opacity:.5}
.preview{margin-top:12px;border:4px solid #E2E2E2;outline:1px solid #D4D4D4;border-radius:8px;background:#242524;min-height:120px;display:grid;place-items:center;overflow:hidden}
.preview img{max-width:100%;display:block}
.ok{color:#1E4637;background:#E1ECE6;border-radius:6px;padding:10px;margin-top:12px}
.err{color:#A63232;background:#F7E1E0;border-radius:6px;padding:10px;margin-top:12px}
.seg{display:flex;gap:6px;margin-top:4px}.seg button{margin:0;height:38px;background:#EFEAE1;color:#4A6358;font-weight:500}
.seg button.on{background:#FCFBF8;border:1.5px solid #19382C;color:#19382C}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
`;

export function mobileUploadPage(token: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DermEMR — загрузка снимка</title><style>${BASE_CSS}</style></head><body><div class="wrap">
<h1>Снимок для карты приема</h1><div class="muted" id="who">Подключение…</div>
<div class="card">
  <label>Очаг на карте тела</label><select id="marker"></select>
  <label style="margin-top:12px">Тип снимка</label>
  <div class="seg"><button type="button" class="on" data-kind="MACRO_PHOTO">Макрофото</button><button type="button" data-kind="DERMATOSCOPY">Дерматоскопия</button></div>
  <input id="file" type="file" accept="image/*" capture="environment" hidden>
  <button type="button" id="shoot">Сделать снимок</button>
  <div class="preview" id="preview"><span class="muted">Снимок не выбран</span></div>
  <button type="button" id="send" disabled>Отправить в карту</button>
  <div id="msg"></div>
</div>
<p class="muted">Снимок не сохраняется в галерее телефона. Метаданные (GPS, модель устройства) удаляются. Ссылка действует 15 минут.</p>
</div>
<script>
const t=${JSON.stringify(token)};let kind='MACRO_PHOTO',blob=null;
const $=(id)=>document.getElementById(id);
fetch('/api/v1/m/session?t='+encodeURIComponent(t)).then(r=>r.ok?r.json():Promise.reject(r)).then(s=>{
  $('who').textContent='Пациент: '+s.patient+' · врач: '+s.doctor;
  const sel=$('marker');sel.innerHTML='<option value="">Без привязки к очагу</option>'+s.markers.map(m=>'<option value="'+m.id+'">#'+m.number+' '+m.label+'</option>').join('');
}).catch(()=>{$('who').textContent='Ссылка недействительна или истекла. Обновите QR-код на компьютере врача.';$('shoot').disabled=true;});
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.seg button').forEach(x=>x.classList.remove('on'));b.classList.add('on');kind=b.dataset.kind;});
$('shoot').onclick=()=>$('file').click();
$('file').onchange=async(e)=>{const f=e.target.files[0];if(!f)return;
  // перекодирование через canvas удаляет EXIF еще на телефоне
  const img=await createImageBitmap(f);const k=Math.min(1,2400/Math.max(img.width,img.height));
  const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));
  $('preview').innerHTML='';const im=new Image();im.src=URL.createObjectURL(blob);$('preview').appendChild(im);$('send').disabled=false;$('msg').innerHTML='';};
$('send').onclick=async()=>{$('send').disabled=true;$('msg').innerHTML='<div class="muted" style="margin-top:12px">Отправка…</div>';
  const q='?t='+encodeURIComponent(t)+'&marker_id='+encodeURIComponent($('marker').value)+'&kind='+kind;
  const r=await fetch('/api/v1/media/mobile-upload'+q,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
  $('msg').innerHTML=r.ok?'<div class="ok">Снимок добавлен в карту. Можно сделать следующий.</div>':'<div class="err">Не удалось отправить ('+r.status+'). Обновите QR-код.</div>';
  if(r.ok){blob=null;$('preview').innerHTML='<span class="muted">Снимок не выбран</span>';}else{$('send').disabled=false;}};
</script></body></html>`;
}

export function verifyPage(found: { patient: string; date: string; doctor: string; docs: string[]; hash: string } | null): string {
  const body = found
    ? `<div class="ok">Документ подлинный: выпущен клиникой и не изменялся.</div>
       <div class="card"><label>Пациент</label>${found.patient}<label style="margin-top:10px">Дата приема</label>${found.date}
       <label style="margin-top:10px">Врач</label>${found.doctor}<label style="margin-top:10px">Документы пакета</label>${found.docs.join(', ')}
       <label style="margin-top:10px">Код проверки</label><span class="mono">${found.hash}</span></div>`
    : `<div class="err">Документ с таким кодом не найден. Возможно, он изменен или выпущен не этой клиникой.</div>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Проверка подлинности документа</title><style>${BASE_CSS}</style></head><body><div class="wrap">
<h1>Проверка подлинности</h1><div class="muted">Клиника дерматологии «Атлас»</div>${body}</div></body></html>`;
}
