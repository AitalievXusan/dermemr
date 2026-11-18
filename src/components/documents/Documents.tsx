import type { EncounterState, Projection } from '../../types';
import { formatAge } from '../../lib/calculators';
import { dateRu, rub, timeHHMM } from '../../lib/format';
import { qrSvg } from '../../lib/qr';
import { groupByTimeOfDay, memoFor, plainDiagnosis, rxDrugs, type DayStep } from '../../lib/documents';
import { BodySilhouette } from './BodySilhouette';
import { dermatoscopyText, LESION_LABELS, morphologySentence } from '../../lib/clinicalText';
import type { MediaItem } from '../left/media';

// HTML-шаблоны документов (DESIGN §7, SPEC §5). В проде тот же JSX рендерится на сервере
// (renderToStaticMarkup → Playwright page.pdf()).

export const CLINIC = {
  name: 'Клиника дерматологии «Атлас»',
  legal: 'ООО «Атлас Дерм» · ИНН 7701234567',
  address: 'г. Москва, ул. Пречистенка, 12',
  phone: '+7 495 000-00-00',
  license: 'Лицензия № Л041-01137-77/00366341',
  doctor: 'Соколова Елена Андреевна',
  doctorTitle: 'врач-дерматовенеролог, высшая категория',
};

const COURSE = { ACUTE: 'острое', SUBACUTE: 'подострое', CHRONIC: 'хроническое' } as const;
const DISTR = { LIMITED: 'ограниченный', DISSEMINATED: 'распространенный', UNIVERSAL: 'универсальный' } as const;
const STAGE = { PROGRESSIVE: 'прогрессирующая', STATIONARY: 'стационарная', REGRESSIVE: 'регрессирующая' } as const;
const SEV = { MILD: 'легкая', MODERATE: 'средняя', SEVERE: 'тяжелая' } as const;

export function verificationHash(state: EncounterState): string {
  const str = JSON.stringify(state.soap) + state.encounterId;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822519);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
}

/** QR-код проверки подлинности: ведет на страницу /verify/<hash> сервера клиники. */
function QrMark({ url, size = 22 }: { url: string; size?: number }) {
  return <span className="qr" dangerouslySetInnerHTML={{ __html: qrSvg(url, { color: '#1B3B2E', sizeCss: `${size}mm` }) }} />;
}

export const verifyUrlFor = (base: string, hash: string) => `${base.replace(/\/$/, '')}/verify/${hash}`;

function usedProjections(state: EncounterState): Projection[] {
  const set = new Set(state.markers.map((m) => m.projection));
  return (['FRONT', 'BACK', 'HEAD_FACE', 'HANDS_FEET'] as Projection[]).filter((p) => set.has(p));
}

function PatientHeaderA4({ state, title, verifyBase }: { state: EncounterState; title: string; verifyBase: string }) {
  const p = state.patient;
  const hash = verificationHash(state);
  return (
    <>
      <div className="a4__clinic">
        <div>
          <div className="a4__clinic-name">{CLINIC.name}</div>
          <div className="a4__clinic-meta">{CLINIC.legal} · {CLINIC.address} · {CLINIC.phone}</div>
          <div className="a4__clinic-meta">{CLINIC.license}</div>
        </div>
        <div>
          <QrMark url={verifyUrlFor(verifyBase, hash)} size={18} />
        </div>
      </div>
      <div className="a4__title">{title}</div>
      <div className="a4__passport avoid">
        <div><span className="a4__k">Амбулаторная карта</span><span className="mono">{p.cardNumber}</span></div>
        <div><span className="a4__k">Дата и время осмотра</span><span className="mono">{dateRu(state.startedAt)} {timeHHMM(state.startedAt)}</span></div>
        <div><span className="a4__k">Пол / возраст</span>{p.sex === 'F' ? 'женский' : 'мужской'}, {formatAge(p.birthDate)}</div>
        <div className="w8"><span className="a4__k">Пациент</span><strong>{p.fullName}</strong>, д. р. <span className="mono">{dateRu(p.birthDate)}</span></div>
        <div><span className="a4__k">Фототип</span>{p.fitzpatrick} по Фитцпатрику</div>
        <div className="w8"><span className="a4__k">Врач</span>{CLINIC.doctor}, {CLINIC.doctorTitle}</div>
        <div><span className="a4__k">Аллергоанамнез</span>{p.allergies.join(', ') || 'не отягощен'}</div>
      </div>
    </>
  );
}

function SignatureFooter({ state, verifyBase }: { state: EncounterState; verifyBase: string }) {
  const hash = verificationHash(state);
  return (
    <div className="a4__foot avoid">
      <div>
        <div className="a4__sign" />
        <span className="a4__k">Подпись врача / М. П.</span>
      </div>
      <div className="a4__ukep">
        <strong>Документ подписан УКЭП</strong><br />
        Владелец: {CLINIC.doctor}<br />
        Сертификат: <span className="mono">01D8 7A3F … 9C21</span><br />
        Действителен: <span className="mono">12.03.2026 – 12.03.2027</span>
      </div>
      <div>
        <QrMark url={verifyUrlFor(verifyBase, hash)} size={20} />
        <div className="qr-cap mono">{hash.slice(0, 8)}-{hash.slice(8)}</div>
      </div>
    </div>
  );
}

export interface DocProps { state: EncounterState; verifyBase: string }

export function SummaryA4({ state, photos, verifyBase }: DocProps & { photos: MediaItem[] }) {
  const { subjective: S, objective: O, assessment: A, plan: P } = state.soap;
  const d = A.primaryDiagnosis;
  const proj = usedProjections(state).filter((p) => p === 'FRONT' || p === 'BACK').slice(0, 2);
  const markersOf = (p: Projection) => state.markers.filter((m) => m.projection === p);
  const slot = (arr: string[], s: string) => (arr.includes(s) ? '●' : '');
  const prescribed = P.proceduresAndLabs.filter((x) => x.category === 'PRESCRIBED');
  const dermPhotos = state.docs.attachDermatoscopy ? photos.filter((ph) => ph.includeInPdf).slice(0, 4) : [];

  return (
    <div className="a4">
      <PatientHeaderA4 state={state} verifyBase={verifyBase} title="Консультативное заключение врача-дерматовенеролога" />

      <h2>Жалобы и анамнез</h2>
      <p><span className="lbl">Жалобы:</span> {S.complaintTags.join(', ') || '—'}. Интенсивность зуда по ВАШ: <span className="mono">{S.itchVasScore}/10</span>{S.sleepDisturbance ? ', нарушение сна' : ''}.</p>
      {S.anamnesisMorbi && <p><span className="lbl">Анамнез заболевания:</span> {S.anamnesisMorbi}</p>}
      {S.anamnesisVitae && <p><span className="lbl">Анамнез жизни:</span> {S.anamnesisVitae}</p>}
      {S.previousTherapySummary && <p><span className="lbl">Ранее проведенная терапия:</span> {S.previousTherapySummary}</p>}

      <h2>Status localis</h2>
      <div className="a4__status">
        <div>
          <p>
            Течение {O.processCourse ? COURSE[O.processCourse] : '—'}, процесс {O.distribution ? DISTR[O.distribution] : '—'}
            {O.symmetry ? (O.symmetry === 'SYMMETRIC' ? ', симметричный' : ', асимметричный') : ''}.
            {' '}{morphologySentence(O.primaryElements, O.secondaryElements)}
          </p>
          {O.localizationText && <p><span className="lbl">Локализация:</span> {O.localizationText}</p>}
          {O.statusLocalis && <p>{O.statusLocalis}</p>}
          {O.bordersDescription && <p>{O.bordersDescription}</p>}
          {state.markers.map((m) => m.description && (
            <p key={m.id}><span className="mono">#{m.number}</span> {m.anatomyLabel} ({LESION_LABELS[m.lesionType].toLowerCase()}): {m.description}</p>
          ))}
          {Object.keys(O.dermatoscopy).length > 0 && (
            <p><span className="lbl">Дерматоскопия:</span>{' '}
              {state.markers.filter((m) => O.dermatoscopy[m.id]).map((m) => dermatoscopyText(m, O.dermatoscopy[m.id])).join(' ')} {O.dermatoscopyNotes}
            </p>
          )}
          {O.appendagesStatus && <p><span className="lbl">Придатки кожи:</span> {O.appendagesStatus}</p>}
        </div>
        <div>
          <div className="a4__map">
            {proj.map((p) => <BodySilhouette key={p} projection={p} markers={markersOf(p)} />)}
          </div>
          {dermPhotos.length > 0 && (
            <div className="a4__photos">
              {dermPhotos.map((ph) => {
                const mk = state.markers.find((m) => m.id === ph.markerId);
                return (
                  <figure key={ph.id} className="a4__photo">
                    <img src={ph.url} alt="" />
                    <span className="mono">#{mk?.number ?? '—'} · {dateRu(ph.date)}</span>
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <h2>Диагноз</h2>
      <p className="a4__dx avoid">
        <span className="mono">{d.icd10Code || '—'}</span> {d.icd10Name}
        {d.clinicalForm ? `. ${d.clinicalForm}` : ''}
        {d.stage ? `, ${STAGE[d.stage]} стадия` : ''}
        {d.severity ? `, ${SEV[d.severity]} степень тяжести` : ''}.
        {Object.entries(A.calculators).map(([k, v]) => (
          <span key={k} className="mono"> {k} {v!.score}{v!.bsaPercent != null ? `, BSA ${v!.bsaPercent}%` : ''};</span>
        ))}
      </p>
      {A.secondaryDiagnoses.length > 0 && <p><span className="lbl">Сопутствующие:</span> {A.secondaryDiagnoses.map((x) => `${x.icd10Code} ${x.icd10Name}`).join('; ')}</p>}
      {A.showDiffInPdf && A.differentialDiagnosis && <p><span className="lbl">Дифференциальный диагноз:</span> {A.differentialDiagnosis}</p>}

      <h2>План лечения</h2>
      {(P.topicalTherapy.length > 0 || P.systemicTherapy.length > 0 || P.extemporalPrescriptions.length > 0) && (
        <table className="avoid">
          <thead>
            <tr><th>Препарат / Форма</th><th>Зона нанесения / Режим</th><th className="c">Утро</th><th className="c">День</th><th className="c">Вечер</th><th>Курс</th></tr>
          </thead>
          <tbody>
            {P.topicalTherapy.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.drugName}</strong><br />{t.form}, {t.method.toLowerCase()}</td>
                <td>{t.applicationZone}<br />{t.frequency}</td>
                <td className="c">{slot(t.timeOfDaySlot, 'MORNING')}</td>
                <td className="c">{slot(t.timeOfDaySlot, 'DAY')}</td>
                <td className="c">{slot(t.timeOfDaySlot, 'EVENING')}</td>
                <td><span className="mono">{t.durationDays} дн.</span>{t.taperingScheme ? <><br />{t.taperingScheme}</> : null}</td>
              </tr>
            ))}
            {P.extemporalPrescriptions.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.title}</strong><br />экстемпоральная пропись</td>
                <td>{x.applicationZone}<br />{x.sig}</td>
                <td className="c">{slot(x.timeOfDaySlot, 'MORNING')}</td>
                <td className="c">{slot(x.timeOfDaySlot, 'DAY')}</td>
                <td className="c">{slot(x.timeOfDaySlot, 'EVENING')}</td>
                <td className="mono">{x.durationDays} дн.</td>
              </tr>
            ))}
            {P.systemicTherapy.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.drugName}</strong> <span className="mono">{t.dose}</span><br />внутрь</td>
                <td>{t.regimen}, {t.mealRelation}</td>
                <td className="c">{slot(t.timeOfDaySlot, 'MORNING')}</td>
                <td className="c">{slot(t.timeOfDaySlot, 'DAY')}</td>
                <td className="c">{slot(t.timeOfDaySlot, 'EVENING')}</td>
                <td className="mono">{t.durationDays} дн.</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {P.skincareRoutine.length > 0 && (
        <table className="avoid">
          <thead><tr><th>Базовый уход</th><th>Средство</th><th className="c">Утро</th><th className="c">День</th><th className="c">Вечер</th><th /></tr></thead>
          <tbody>
            {P.skincareRoutine.map((c) => (
              <tr key={c.id}><td>{c.step}</td><td>{c.productRecommendation}</td>
                <td className="c">{slot(c.timeOfDaySlot, 'MORNING')}</td><td className="c">{slot(c.timeOfDaySlot, 'DAY')}</td><td className="c">{slot(c.timeOfDaySlot, 'EVENING')}</td><td /></tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: '3mm' }}>
        <span className="lbl">Рекомендованная диагностика:</span> {prescribed.map((x) => x.name).join('; ') || 'не требуется'}.
      </p>
      <p><span className="lbl">Контрольная явка:</span> через <span className="mono">{P.followUpDays}</span> дн.</p>
      {P.generalRecommendations && <p><span className="lbl">Рекомендации:</span> {P.generalRecommendations}</p>}

      <SignatureFooter state={state} verifyBase={verifyBase} />
    </div>
  );
}

export function PrescriptionsA4({ state }: DocProps) {
  const drugs = rxDrugs(state);
  const p = state.patient;
  return (
    <div className="a4">
      {drugs.map((d, i) => (
        <div key={d.name + i} className="rx-blank avoid">
          <h3>Рецепт · форма № 107-1/у</h3>
          <div className="row"><span className="k">Серия / номер</span><span className="mono">45 АТ № {String(1048 + i).padStart(6, '0')}</span></div>
          <div className="row"><span className="k">Дата выписки</span><span className="mono">{dateRu(state.startedAt)}</span></div>
          <div className="row"><span className="k">Пациент</span><span>{p.fullName}, {formatAge(p.birthDate)}</span></div>
          <div className="row"><span className="k">Врач</span><span>{CLINIC.doctor}</span></div>
          <div className="rp">
            <div><strong>Rp.:</strong> {d.name}</div>
            <div><strong>D.t.d.</strong> {d.form} — на курс {d.days} дн.</div>
            <div><strong>S.:</strong> {d.sig}</div>
          </div>
          <div className="row"><span className="k">Срок действия</span><span>60 дней</span></div>
          <div className="row"><span className="k">Подпись и печать врача</span><span /></div>
        </div>
      ))}
    </div>
  );
}

export function ExtemporalRxA4({ state }: DocProps) {
  const p = state.patient;
  return (
    <div className="a4">
      {state.soap.plan.extemporalPrescriptions.map((x, i) => (
        <div key={x.id} className="rx-blank avoid">
          <h3>Рецепт · экстемпоральная пропись (107-1/у)</h3>
          <div className="row"><span className="k">Серия / номер</span><span className="mono">45 ЭП № {String(2010 + i).padStart(6, '0')}</span></div>
          <div className="row"><span className="k">Дата выписки</span><span className="mono">{dateRu(state.startedAt)}</span></div>
          <div className="row"><span className="k">Пациент</span><span>{p.fullName}, {formatAge(p.birthDate)}</span></div>
          <div className="row"><span className="k">Врач</span><span>{CLINIC.doctor}</span></div>
          <div className="rp">
            <div><strong>Rp.:</strong></div>
            {x.composition.map((c, j) => (
              <div key={j} className="mono" style={{ paddingLeft: '10mm' }}>{c.ingredient} {c.amount}</div>
            ))}
            <div><strong>{x.form}</strong></div>
            <div><strong>D.S.</strong> {x.sig} Зона: {x.applicationZone || 'очаги поражения'}.</div>
          </div>
          <div className="row"><span className="k">Срок действия</span><span>60 дней</span></div>
          <div className="row"><span className="k">Подпись и печать врача</span><span /></div>
        </div>
      ))}
    </div>
  );
}

export function MemoA4({ state, verifyBase }: DocProps) {
  const memos = memoFor(state.soap.assessment.primaryDiagnosis.icd10Code);
  return (
    <div className="a4">
      <PatientHeaderA4 state={state} verifyBase={verifyBase} title="Памятка пациента" />
      {memos.map((m) => (
        <div key={m.key} className="avoid">
          <h2>{m.title}</h2>
          <p>{m.text}</p>
        </div>
      ))}
    </div>
  );
}

export function EstimateA4({ state, verifyBase }: DocProps) {
  const items = state.soap.plan.proceduresAndLabs.filter((i) => i.category === 'PRESCRIBED');
  const k = 1 - state.billing.discountPercent / 100;
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice * k, 0);
  return (
    <div className="a4">
      <PatientHeaderA4 state={state} verifyBase={verifyBase} title="Смета рекомендованных услуг и анализов" />
      <table>
        <thead><tr><th>Код</th><th>Услуга</th><th className="c">Кол-во</th><th>Стоимость</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}><td className="mono">{i.serviceCode}</td><td>{i.name}</td><td className="c mono">{i.quantity}</td><td className="mono">{rub(i.quantity * i.unitPrice * k)}</td></tr>
          ))}
          <tr><td /><td><strong>Итого</strong></td><td /><td className="mono"><strong>{rub(total)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Mobile ----------------

function FormIcon({ step }: { step: DayStep }) {
  const f = (step.form ?? '').toLowerCase();
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };
  if (step.kind === 'systemic' || f.includes('табл'))
    return <svg {...common}><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8" /></svg>; // таблетка
  if (step.kind === 'care' && !f)
    return <svg {...common}><path d="M9 3h6v3H9z" /><path d="M8 6h8l1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9z" /></svg>; // флакон
  if (f.includes('раствор') || f.includes('лосьон') || f.includes('спрей') || f.includes('шампунь') || f.includes('эмульс'))
    return <svg {...common}><path d="M10 2h4v4h-4z" /><path d="M7 9a5 3 0 0 1 10 0v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" /></svg>; // флакон раствора
  return <svg {...common}><path d="M6 21h12" /><path d="M8 21 7 9h10l-1 12" /><path d="M10 9V6h4v3" /><path d="M11 3h2v3h-2z" /></svg>; // тюбик
}

const SLOT_NAMES = { MORNING: 'УТРО', DAY: 'ДЕНЬ', EVENING: 'ВЕЧЕР' } as const;

export function SummaryMobile({ state, verifyBase }: DocProps) {
  const d = state.soap.assessment.primaryDiagnosis;
  const P = state.soap.plan;
  const groups = groupByTimeOfDay(state);
  const memos = memoFor(d.icd10Code).slice(0, 2);
  const labs = P.proceduresAndLabs.filter((x) => x.category === 'PRESCRIBED');
  const followDate = new Date(state.startedAt + P.followUpDays * 86400000);
  const proj = usedProjections(state).filter((p) => p === 'FRONT' || p === 'BACK');

  return (
    <div className="mob">
      <div className="mob__head">
        <div className="mob__clinic"><span>{CLINIC.name}</span><span className="mono">{dateRu(state.startedAt)}</span></div>
        <div className="mob__title">{state.patient.fullName}</div>
        <div className="mob__who">Врач: {CLINIC.doctor}</div>
      </div>

      <div className="mob__dx avoid">
        <div className="mob__dx-k">Ваш диагноз</div>
        <div className="mob__dx-name">{d.icd10Name || 'Диагноз уточняется'}</div>
        <div>{plainDiagnosis(d.icd10Code)}</div>
      </div>

      <h2>План лечения на день</h2>
      {(Object.keys(groups) as (keyof typeof groups)[]).map((slot) =>
        groups[slot].length ? (
          <div key={slot} className="mob__slot avoid">
            <div className="mob__slot-name">{SLOT_NAMES[slot]}</div>
            {groups[slot].map((st, i) => (
              <div key={i} className="mob__step">
                <FormIcon step={st} />
                <div>
                  <div className="mob__step-title">{st.kind === 'care' ? `${st.title}: ${st.detail}` : st.title}</div>
                  {st.kind !== 'care' && <div className="mob__step-detail">{st.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : null,
      )}

      <div className="mob__slot avoid">
        <div className="mob__slot-name">ДОПОЛНИТЕЛЬНО</div>
        <div className="mob__step"><span /><div>Контрольный визит через <strong>{P.followUpDays} дн.</strong> — <span className="mono">{dateRu(followDate)}</span></div></div>
        {labs.length > 0 && <div className="mob__step"><span /><div>Сдать до визита: {labs.map((l) => l.name).join('; ')}</div></div>}
      </div>

      {state.markers.length > 0 && proj.length > 0 && (
        <>
          <h2>Схема очагов</h2>
          <div className="mob__map">
            {proj.map((p) => <BodySilhouette key={p} projection={p} markers={state.markers.filter((m) => m.projection === p)} />)}
          </div>
          <ul className="mob__legend">
            {state.markers.map((m) => <li key={m.id}><span className="mono">#{m.number}</span> — {m.anatomyLabel}</li>)}
          </ul>
        </>
      )}

      <h2>Важные правила</h2>
      <div className="mob__rule avoid">
        {P.generalRecommendations && <p>{P.generalRecommendations}</p>}
        {memos.map((m) => <p key={m.key}>{m.text}</p>)}
      </div>

      <a className="mob__btn" href="https://clinic.example/booking?doctor=sokolova">Записаться на повторный прием</a>
      <a className="mob__btn mob__btn--ghost" href="https://clinic.example/lk/documents">Скачать официальную версию A4 с печатью</a>

      <div className="mob__foot">
        <span className="mob__badge">Подписано электронной подписью врача</span>
        <div>Проверка подлинности: <a href={verifyUrlFor(verifyBase, verificationHash(state))}>{verificationHash(state).slice(0, 8)}</a></div>
        <div>Контакт-центр 24/7: <span className="mono">{CLINIC.phone}</span></div>
      </div>
    </div>
  );
}
