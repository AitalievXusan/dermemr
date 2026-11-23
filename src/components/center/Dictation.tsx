import { useEffect, useRef, useState } from 'react';
import { toast } from '../../state';
import { insertIntoActiveField } from '../ui/SmartText';
import { Icon } from '../ui/Icon';
import { tr } from '../../lib/i18n';

// Голосовой ввод (PRD этап 3): Web Speech API браузера (Chrome / Edge), язык ru-RU.
// Текст вставляется в последнее активное поле протокола. Автоматическая раскладка
// по разделам SOAP требует подключения языковой модели и в локальную версию не входит.

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export function Dictation() {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal && !insertIntoActiveField(res[0].transcript)) {
          toast(tr('Поставьте курсор в поле протокола, затем диктуйте'));
        }
      }
    };
    r.onend = () => setOn(false);
    r.onerror = (e) => { setOn(false); if (e.error !== 'aborted' && e.error !== 'no-speech') toast(`${tr('Диктовка')}: ${e.error === 'not-allowed' ? tr('нет доступа к микрофону') : e.error}`, 'danger'); };
    rec.current = r;
    r.start();
    setOn(true);
  };

  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm dictation${on ? ' is-on' : ''}`}
      onMouseDown={(e) => e.preventDefault() /* не забирать фокус у поля */}
      onClick={toggle}
      disabled={!Ctor}
      title={Ctor ? tr('Голосовой ввод в активное поле (ru-RU)') : tr('Браузер не поддерживает распознавание речи — используйте Chrome или Edge')}
    >
      <Icon name="mic" /> {on ? tr('Слушаю…') : tr('Диктовка')}
    </button>
  );
}
