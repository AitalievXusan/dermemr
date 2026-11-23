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

// Сервер (npm start) → очередь, касса, PDF, мессенджеры. Без сервера — демо-визит в браузере.
initServer().finally(() => {
  initRealtime();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
