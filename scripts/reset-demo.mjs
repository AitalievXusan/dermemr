// Сброс локальных данных к демо-состоянию (удаляет storage/: пациенты, визиты, снимки, PDF).
import { rmSync } from 'node:fs';
rmSync('storage', { recursive: true, force: true });
console.log('Данные удалены. При следующем запуске будут созданы демо-пациенты.');
