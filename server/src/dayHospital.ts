import { db, saveDb } from './db';
import { HttpError, json, readJson, route } from './http';
import { audit, newId } from './security';
import {
  COURSE_DAYS, templateForIcd, templateRows, todayIso,
  type DayCourse, type DayCourseInput, type DayPattern, type DayRow, type DaySection, type DayTemplate,
} from '../../src/data/dayHospital';

// Дневной стационар: курсы по 10 дней. Независимый раздел; при создании из приёма
// данные пациента и диагноз переносятся из визита автоматически.

const courses = (): DayCourse[] => (db().dayCourses ??= []);
const find = (id: string) => {
  const c = courses().find((x) => x.id === id);
  if (!c) throw new HttpError(404, 'Курс не найден');
  return c;
};

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const SECS: DaySection[] = ['drug', 'top', 'phys'];
const PKS: DayPattern[] = ['daily', 'odd', 'even', 'home', 'manual'];
const TPLS: DayTemplate[] = ['vit', 'acne', 'empty'];

function cleanRows(v: unknown): DayRow[] {
  if (!Array.isArray(v)) throw new HttpError(422, 'rows: ожидается массив');
  return v.slice(0, 60).map((r: Partial<DayRow>, i) => ({
    id: str(r.id, 40) || `dr_${Date.now().toString(36)}_${i}`,
    sec: SECS.includes(r.sec as DaySection) ? (r.sec as DaySection) : 'drug',
    ru: str(r.ru),
    uz: str(r.uz),
    cells: Array.from({ length: COURSE_DAYS }, (_, j) => str(Array.isArray(r.cells) ? r.cells[j] : '', 8)),
    std: r.std === true ? true : r.std === false ? false : null,
    pk: PKS.includes(r.pk as DayPattern) ? (r.pk as DayPattern) : 'manual',
  }));
}

function applyInput(c: DayCourse, b: DayCourseInput) {
  (['fio', 'birthYear', 'phone', 'diagnosis', 'doctor'] as const).forEach((k) => {
    if (b[k] !== undefined) c[k] = str(b[k]);
  });
  if (b.startDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.startDate))) throw new HttpError(422, 'Дата начала в формате ГГГГ-ММ-ДД');
    c.startDate = String(b.startDate);
  }
  if (b.template !== undefined && TPLS.includes(b.template)) c.template = b.template;
  if (b.lang === 'ru' || b.lang === 'uz') c.lang = b.lang;
  if (b.status === 'ACTIVE' || b.status === 'DONE') c.status = b.status;
  if (b.rows !== undefined) c.rows = cleanRows(b.rows);
}

/** Данные пациента и диагноз из амбулаторного приёма. */
function fromEncounter(encounterId: string): Partial<DayCourse> {
  const e = db().encounters.find((x) => x.id === encounterId);
  if (!e) throw new HttpError(404, 'Визит не найден');
  const p = db().patients.find((x) => x.id === e.patientId);
  const d = e.soap.assessment.primaryDiagnosis;
  const form = d.clinicalForm && d.clinicalForm !== d.icd10Name ? `, ${d.clinicalForm.toLowerCase()}` : '';
  const stage = d.stage === 'PROGRESSIVE' ? ', прогрессирующая стадия' : d.stage === 'STATIONARY' ? ', стабильная стадия' : '';
  return {
    encounterId: e.id,
    patientId: e.patientId,
    fio: p?.fullName ?? '',
    birthYear: p?.birthDate?.slice(0, 4) ?? '',
    phone: p?.phone ?? '',
    diagnosis: d.icd10Code ? `${d.icd10Name}${form}${stage} (${d.icd10Code})` : '',
    template: templateForIcd(d.icd10Code),
  };
}

export function registerDayHospitalRoutes() {
  route('GET', '/api/v1/day-courses', (_req, res) => {
    json(res, 200, [...courses()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  });

  route('GET', '/api/v1/day-courses/:id', (req, res) => json(res, 200, find(req.params.id)));

  route('POST', '/api/v1/day-courses', async (req, res) => {
    const b = await readJson<DayCourseInput & { fromEncounterId?: string }>(req);
    const linked = b.fromEncounterId ? fromEncounter(b.fromEncounterId) : {};
    // Повторное нажатие «Оформить курс» в том же приёме открывает уже созданный курс
    if (linked.encounterId) {
      const existing = courses().find((c) => c.encounterId === linked.encounterId && c.status === 'ACTIVE');
      if (existing) return json(res, 200, existing);
    }
    const now = new Date().toISOString();
    const template = (linked.template ?? (TPLS.includes(b.template as DayTemplate) ? b.template : 'empty')) as DayTemplate;
    const c: DayCourse = {
      id: newId('dh'), encounterId: null, patientId: null, fio: '', birthYear: '', phone: '', diagnosis: '', doctor: '',
      startDate: todayIso(), template, lang: 'ru', rows: templateRows(template), status: 'ACTIVE', createdAt: now, updatedAt: now,
      ...linked,
    };
    applyInput(c, { ...b, template: undefined, rows: b.rows });
    courses().push(c);
    saveDb();
    audit('CREATE_DAY_COURSE', c.id, req.ip);
    json(res, 201, c);
  });

  route('PATCH', '/api/v1/day-courses/:id', async (req, res) => {
    const c = find(req.params.id);
    applyInput(c, await readJson<DayCourseInput>(req));
    c.updatedAt = new Date().toISOString();
    saveDb();
    json(res, 200, c);
  });

  route('DELETE', '/api/v1/day-courses/:id', (req, res) => {
    const c = find(req.params.id);
    db().dayCourses = courses().filter((x) => x.id !== c.id);
    saveDb();
    audit('DELETE_DAY_COURSE', c.id, req.ip);
    json(res, 200, { ok: true });
  });
}
