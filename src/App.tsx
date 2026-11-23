import { parseHash, useHash } from './lib/router';
import { useLang } from './lib/i18n';
import { server } from './lib/api';
import { Toasts } from './components/ui/Overlays';
import { EncounterPage } from './pages/EncounterPage';
import { QueuePage } from './pages/QueuePage';
import { CashierPage } from './pages/CashierPage';
import { PortalPage } from './pages/PortalPage';
import { DayHospitalPage, startDayCourse } from './pages/DayHospitalPage';
import { DayCoursePage } from './pages/DayCoursePage';
import { DayPrintPage } from './pages/DayPrintPage';
import { LoginPage } from './pages/LoginPage';

const DAY_ROUTES = ['dayHospital', 'dayCourse', 'dayPrint'];

export function App() {
  useLang(); // смена языка перерисовывает весь интерфейс
  const route = parseHash(useHash());
  // Облачная версия: без входа доступен только личный кабинет пациента
  if (server.needLogin && route.name !== 'portal') return <><LoginPage /><Toasts /></>;
  // Без сервера доступны демо-визит и дневной стационар (курсы хранятся в браузере)
  const effective = !server.online && route.name !== 'encounter' && !DAY_ROUTES.includes(route.name) ? { name: 'encounter' as const, id: 'enc_2026_11_18_0042' } : route;
  return (
    <>
      {effective.name === 'queue' && <QueuePage />}
      {effective.name === 'encounter' && <EncounterPage id={effective.id} onDayHospital={() => void startDayCourse(effective.id)} />}
      {effective.name === 'dayHospital' && <DayHospitalPage />}
      {effective.name === 'dayCourse' && <DayCoursePage id={effective.id} />}
      {effective.name === 'dayPrint' && <DayPrintPage id={effective.id} lang={effective.lang} />}
      {effective.name === 'cashier' && <CashierPage />}
      {effective.name === 'portal' && <PortalPage patientId={effective.patientId} />}
      <Toasts />
    </>
  );
}
