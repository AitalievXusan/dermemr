import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initRealtime, ui } from './state';
import { initServer } from './lib/api';
import { getLang } from './lib/i18n';
import './styles/tokens.css';
import './styles/app.css';
import './styles/visit.css';

document.documentElement.dataset.theme = ui.get().theme;
document.documentElement.lang = getLang() === 'uz' ? 'uz-Cyrl' : 'ru';

// Сервер (npm start или облако) → очередь, касса, PDF, мессенджеры. Без сервера (GitHub Pages) — демо-визит в браузере.
const bootMsg = (text: string) => { const el = document.getElementById('boot-msg'); if (el) el.textContent = text; };
initServer((attempt) => bootMsg(attempt === 0 ? 'Подключение к серверу…' : `Сервер не отвечает, пробую снова (${attempt + 1})…`)).finally(() => {
  initRealtime();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
