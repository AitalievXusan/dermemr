import { encounter, ui, useEnc } from '../../state';
import { rxDrugs } from '../../lib/documents';
import { Checkbox } from '../ui/controls';
import { Icon } from '../ui/Icon';
import type { DocsSelection } from '../../types';
import { tr } from '../../lib/i18n';

/** «Документы на выход» (PRD §4.4.2, DESIGN §5.4 Б). */
export function OutputDocs() {
  const state = useEnc((s) => s);
  const docs = state.docs;
  const hasRx = rxDrugs(state).length > 0 || state.soap.plan.extemporalPrescriptions.length > 0;
  const set = (k: keyof DocsSelection, v: boolean) => encounter.set((s) => { s.docs[k] = v; });

  return (
    <section className="panel" aria-label={tr('Документы на выход')}>
      <div className="panel__head"><h2 className="panel__title">{tr('Документы на выход')}</h2></div>
      <div className="docs">
        <Checkbox checked={docs.summary} onChange={(v) => set('summary', v)}>{tr('Заключение (ПК + Mobile)')}</Checkbox>
        <div className="docs__sub">
          <Checkbox checked={docs.attachDermatoscopy} disabled={!docs.summary} onChange={(v) => set('attachDermatoscopy', v)}>{tr('Приложить снимки дерматоскопии')}</Checkbox>
        </div>
        <Checkbox checked={docs.prescriptions && hasRx} disabled={!hasRx} onChange={(v) => set('prescriptions', v)}>
          {tr('Рецепты (107-1/у, прописи)')}{!hasRx && <span className="muted"> {tr('— нет рецептурных')}</span>}
        </Checkbox>
        <Checkbox checked={docs.memo} onChange={(v) => set('memo', v)}>{tr('Памятка пациента')}</Checkbox>
        <Checkbox checked={docs.estimate} onChange={(v) => set('estimate', v)}>{tr('Смета рекомендованных услуг')}</Checkbox>
      </div>
      <button type="button" className="btn btn--accent btn--block btn--tall" onClick={() => ui.set((u) => { u.docsModalOpen = true; })}>
        <Icon name="fileText" /> {tr('Сформировать документы')}
      </button>
      <p className="panel__hint">
        {tr('ИДС на электронные каналы')}:{' '}
        {state.patient.communicationConsent ? <span className="ok">{tr('подписано')}</span> : <span className="danger">{tr('не подписано')}</span>}
      </p>
    </section>
  );
}
