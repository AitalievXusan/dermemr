import { useEffect } from 'react';
import { flushSave, openEncounter, ui, useEnc, useUi } from './state';
import { parseHash, useHash } from './lib/router';
import { server } from './lib/api';
import { StickyHeader } from './components/header/StickyHeader';
import { BodyMap } from './components/left/BodyMap';
import { BeforeAfter } from './components/left/BeforeAfter';
import { Calculators } from './components/left/Calculators';
import { Timeline } from './components/left/Timeline';
import { SoapSheet } from './components/center/SoapSheet';
import { BillingCart } from './components/right/BillingCart';
import { OutputDocs } from './components/right/OutputDocs';
import { DocumentsModal } from './components/documents/DocumentsModal';
import { CdssModal, QrModal, Toasts } from './components/ui/Overlays';
import { QueuePage } from './pages/QueuePage';
import { CashierPage } from './pages/CashierPage';
import { PortalPage } from './pages/PortalPage';

function EncounterPage({ id }: { id: string }) {
  const docsOpen = useUi((s) => s.docsModalOpen);
  const lightbox = useUi((s) => s.lightbox);
  const loading = useUi((s) => s.loading);
  const loadError = useUi((s) => s.loadError);
  const loadedId = useEnc((s) => s.encounterId);

  useEffect(() => {
    void openEncounter(id);
  }, [id]);

  useEffect(() => {
    // Горячие клавиши SPEC §4.1
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 's' || e.key === 'ы' || e.code === 'KeyS')) {
        e.preventDefault();
        void flushSave();
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        ui.set((u) => { u.docsModalOpen = true; });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) return <div className="page-msg">Не удалось открыть визит: {loadError}. <a href="#/">К очереди</a></div>;
  if (server.online && (loading || loadedId !== id)) return <div className="page-msg mono">Загрузка карты…</div>;

  return (
    <div className="app">
      <StickyHeader />
      <main className={`workspace${lightbox ? ' is-lightbox' : ''}`}>
        <aside className="col col--left" aria-label="Визуализация и калькуляторы">
          <BodyMap />
          <BeforeAfter />
          <Calculators />
          <Timeline />
        </aside>
        <section className="col col--center" aria-label="Протокол приема">
          <SoapSheet />
        </section>
        <aside className="col col--right" aria-label="Биллинг и документы">
          <BillingCart />
          <OutputDocs />
        </aside>
      </main>
      {docsOpen && <DocumentsModal />}
      <CdssModal />
      <QrModal />
    </div>
  );
}

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
