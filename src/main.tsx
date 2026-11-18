import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initRealtime, ui } from './state';
import { initServer } from './lib/api';
import './styles/tokens.css';
import './styles/app.css';

document.documentElement.dataset.theme = ui.get().theme;

// Сервер (npm start) → очередь, касса, PDF, мессенджеры. Без сервера — демо-визит в браузере.
initServer().finally(() => {
  initRealtime();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
