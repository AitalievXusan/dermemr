import { parseHash, useHash } from './lib/router';
import { server } from './lib/api';
import { Toasts } from './components/ui/Overlays';
import { EncounterPage } from './pages/EncounterPage';
import { QueuePage } from './pages/QueuePage';
import { CashierPage } from './pages/CashierPage';
import { PortalPage } from './pages/PortalPage';

export function App() {
  const route = parseHash(useHash());
  // Без сервера доступен только демо-визит
  const effective = !server.online && route.name !== 'encounter' ? { name: 'encounter' as const, id: 'enc_2026_11_18_0042' } : route;
  return (
    <>
      {effective.name === 'queue' && <QueuePage />}
      {effective.name === 'encounter' && <EncounterPage id={effective.id} />}
      {effective.name === 'cashier' && <CashierPage />}
      {effective.name === 'portal' && <PortalPage patientId={effective.patientId} />}
      <Toasts />
    </>
  );
}
