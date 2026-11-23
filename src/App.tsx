import { parseHash, useHash } from './lib/router';
import { server } from './lib/api';
import { Toasts } from './components/ui/Overlays';
import { EncounterPage } from './pages/EncounterPage';
import { QueuePage } from './pages/QueuePage';
import { CashierPage } from './pages/CashierPage';
import { PortalPage } from './pages/PortalPage';
import { DayHospitalPage, startDayCourse } from './pages/DayHospitalPage';
import { DayCoursePage } from './pages/DayCoursePage';
import { DayPrintPage } from './pages/DayPrintPage';

const DAY_ROUTES = ['dayHospital', 'dayCourse', 'dayPrint'];

export function App() {
  const route = parseHash(useHash());
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
