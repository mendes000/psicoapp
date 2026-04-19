import type {
  CalendarEvent,
  ConsolidatedPatient,
  Entry,
  Patient,
  PatientColumnMap,
  PatientFormValues,
  Schedule,
  SessionFormValues,
} from "./types";

export const DEFAULT_ORIGINS = [
  "Particular",
  "Indicacao",
  "Instagram",
  "Google Ads",
];

export const DEFAULT_TREATMENTS = [
  "Sessao Avulsa",
  "Terapia Infantil",
  "Terapia para Adolescentes",
  "Terapia para Adultos",
  "Avaliacao Neuropsicologica",
];

export function normalizeText(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    return "";
  }

  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueTexts(values: Iterable<unknown>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) {
      continue;
    }

    const key = normalizeText(text);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);
  }

  return result;
}

export function parseTreatments(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueTexts(value);
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }

  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return uniqueTexts(parsed);
      }
    } catch {}
  }

  for (const separator of [";", "|", ","]) {
    if (text.includes(separator)) {
      return uniqueTexts(text.split(separator));
    }
  }

  return [text];
}

export function serializeTreatments(values: Iterable<unknown>) {
  return uniqueTexts(values).join("; ");
}

export function stripDigits(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "");
}

export function formatPhoneBr(value: unknown) {
  let digits = stripDigits(value);

  if (digits.length > 11 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  digits = digits.slice(0, 11);

  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  const areaCode = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (rest.length <= 4) {
    return `(${areaCode}) ${rest}`;
  }

  if (rest.length === 8) {
    return `(${areaCode}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  return `(${areaCode}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

export function formatCepBr(value: unknown) {
  const digits = stripDigits(value).slice(0, 8);
  if (digits.length <= 5) {
    return digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatDateInput(value: unknown) {
  const digits = stripDigits(value).slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseFlexibleDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toInputDateValue(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toInputTimeValue(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) {
    return "09:00";
  }

  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatDateBr(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) {
    return String(value ?? "").trim();
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateTimeBr(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) {
    return String(value ?? "").trim();
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function calculateAge(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) {
    return "";
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthOffset = today.getMonth() - date.getMonth();

  if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }

  if (age < 0 || age > 130) {
    return "";
  }

  return String(age);
}

export function formatCurrency(value: unknown) {
  const amount = toNumber(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function similarity(a: string, b: string) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left || !right) {
    return 0;
  }

  if (left.includes(right) || right.includes(left)) {
    return 1;
  }

  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      pairs.set(pair, count - 1);
      matches += 1;
    }
  }

  return (2 * matches) / (Math.max(left.length - 1, 0) + Math.max(right.length - 1, 0));
}

function firstFilled(record: Patient | Entry, ...fields: string[]) {
  for (const field of fields) {
    const value = record[field];
    if (value == null) {
      continue;
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function firstFilledAcross(records: Array<Patient | Entry>, ...fields: string[]) {
  for (const record of records) {
    const text = firstFilled(record, ...fields);
    if (text) {
      return text;
    }
  }

  return "";
}

export function consolidatePatients(patients: Patient[], entries: Entry[]) {
  const entryMap = new Map<
    string,
    {
      totalSessoes: number;
      totalCobrado: number;
      totalPago: number;
      saldo: number;
      ultimaSessaoData: string;
      ultimasSessoes: Entry[];
    }
  >();

  const groupedEntries = new Map<string, Entry[]>();

  for (const entry of entries) {
    const name = String(entry.nome ?? "").trim();
    const key = normalizeText(name);
    if (!key) {
      continue;
    }

    const current = groupedEntries.get(key) ?? [];
    current.push(entry);
    groupedEntries.set(key, current);
  }

  for (const [key, grouped] of groupedEntries.entries()) {
    grouped.sort((left, right) => {
      const leftTime = parseFlexibleDate(left.data)?.getTime() ?? 0;
      const rightTime = parseFlexibleDate(right.data)?.getTime() ?? 0;
      return rightTime - leftTime;
    });

    const totalCobrado = grouped.reduce(
      (sum, entry) => sum + toNumber(entry.valor_sessao),
      0,
    );
    const totalPago = grouped.reduce(
      (sum, entry) => sum + toNumber(entry.valor_pago),
      0,
    );

    entryMap.set(key, {
      totalSessoes: grouped.length,
      totalCobrado,
      totalPago,
      saldo: totalPago - totalCobrado,
      ultimaSessaoData: String(grouped[0]?.data ?? ""),
      ultimasSessoes: grouped.slice(0, 5),
    });
  }

  const groupedPatients = new Map<string, Patient[]>();
  for (const patient of patients) {
    const name = String(patient.nome ?? "").trim();
    const key = normalizeText(name);
    if (!key) {
      continue;
    }

    const current = groupedPatients.get(key) ?? [];
    current.push(patient);
    groupedPatients.set(key, current);
  }

  const lines: ConsolidatedPatient[] = [];

  for (const [key, grouped] of groupedPatients.entries()) {
    const sessionData = entryMap.get(key) ?? {
      totalSessoes: 0,
      totalCobrado: 0,
      totalPago: 0,
      saldo: 0,
      ultimaSessaoData: "",
      ultimasSessoes: [],
    };

    lines.push({
      nomeKey: key,
      nome: firstFilledAcross(grouped, "nome"),
      nascimento: firstFilledAcross(grouped, "nascimento"),
      cpf: firstFilledAcross(grouped, "cpf"),
      tratamento: firstFilledAcross(grouped, "tratamento"),
      profissao: firstFilledAcross(grouped, "profissao"),
      origem: firstFilledAcross(grouped, "origem"),
      quemIndicou: firstFilledAcross(grouped, "quem_indicou"),
      telefone: firstFilledAcross(grouped, "telefone"),
      email: firstFilledAcross(grouped, "email"),
      nomeContato: firstFilledAcross(grouped, "nome_do_contato", "nome_contato"),
      contatoEmergencia: firstFilledAcross(
        grouped,
        "contato_emergencia",
        "contato_de_emergencia",
      ),
      endereco: firstFilledAcross(grouped, "endereco"),
      bairro: firstFilledAcross(grouped, "bairro"),
      cidade: firstFilledAcross(grouped, "cidade"),
      cep: firstFilledAcross(grouped, "cep"),
      nomePai: firstFilledAcross(grouped, "nome_do_pai", "nome_pai"),
      nomeMae: firstFilledAcross(grouped, "nome_da_mae", "nome_mae"),
      observacoes: firstFilledAcross(grouped, "observacoees", "observacoes"),
      ...sessionData,
    });
  }

  for (const [key, sessionData] of entryMap.entries()) {
    if (groupedPatients.has(key)) {
      continue;
    }

    const baseName = String(sessionData.ultimasSessoes[0]?.nome ?? "").trim();

    lines.push({
      nomeKey: key,
      nome: baseName || key,
      nascimento: "",
      cpf: "",
      tratamento: "",
      profissao: "",
      origem: "",
      quemIndicou: "",
      telefone: "",
      email: "",
      nomeContato: "",
      contatoEmergencia: "",
      endereco: "",
      bairro: "",
      cidade: "",
      cep: "",
      nomePai: "",
      nomeMae: "",
      observacoes: "",
      ...sessionData,
    });
  }

  return lines.sort((left, right) => {
    const leftTime = parseFlexibleDate(left.ultimaSessaoData)?.getTime() ?? 0;
    const rightTime = parseFlexibleDate(right.ultimaSessaoData)?.getTime() ?? 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return normalizeText(left.nome).localeCompare(normalizeText(right.nome), "pt-BR");
  });
}

export function matchesConsolidatedSearch(patient: ConsolidatedPatient, rawSearch: string) {
  const search = normalizeText(rawSearch);
  if (!search) {
    return true;
  }

  const searchRaw = String(rawSearch ?? "").trim().toLowerCase();
  const nameKey = normalizeText(patient.nome);

  return (
    nameKey.includes(search) ||
    similarity(nameKey, search) >= 0.72 ||
    patient.cpf.toLowerCase().includes(searchRaw) ||
    patient.email.toLowerCase().includes(searchRaw)
  );
}

export function collectPatientColumns(patients: Patient[]): PatientColumnMap {
  const fields = new Set<string>();
  for (const patient of patients) {
    Object.keys(patient).forEach((field) => fields.add(field));
  }

  return {
    nascimento: chooseExistingField(fields, "nascimento"),
    nomeContato: chooseExistingField(fields, "nome_do_contato", "nome_contato"),
    contatoEmergencia: chooseExistingField(
      fields,
      "contato_emergencia",
      "contato_de_emergencia",
    ),
    nomePai: chooseExistingField(fields, "nome_do_pai", "nome_pai"),
    nomeMae: chooseExistingField(fields, "nome_da_mae", "nome_mae"),
    observacoes: chooseExistingField(fields, "observacoees", "observacoes"),
  };
}

function chooseExistingField(fields: Set<string>, ...options: string[]) {
  for (const option of options) {
    if (fields.has(option)) {
      return option;
    }
  }

  return options[0];
}

export function emptyPatientForm(): PatientFormValues {
  return {
    nome: "",
    nascimento: "",
    cpf: "",
    tratamento: "",
    profissao: "",
    origem: DEFAULT_ORIGINS[0],
    quemIndicou: "",
    telefone: "",
    email: "",
    nomeContato: "",
    contatoEmergencia: "",
    endereco: "",
    bairro: "",
    cidade: "",
    cep: "",
    nomePai: "",
    nomeMae: "",
    observacoes: "",
  };
}

export function patientToFormValues(
  patient: Patient | null,
  columns: PatientColumnMap,
): PatientFormValues {
  if (!patient) {
    return emptyPatientForm();
  }

  return {
    nome: String(patient.nome ?? "").trim(),
    nascimento: formatDateInput(patient[columns.nascimento ?? "nascimento"]),
    cpf: String(patient.cpf ?? "").trim(),
    tratamento: serializeTreatments(parseTreatments(patient.tratamento)),
    profissao: String(patient.profissao ?? "").trim(),
    origem: String(patient.origem ?? "").trim() || DEFAULT_ORIGINS[0],
    quemIndicou: String(patient.quem_indicou ?? "").trim(),
    telefone: formatPhoneBr(patient.telefone),
    email: String(patient.email ?? "").trim(),
    nomeContato: String(patient[columns.nomeContato ?? "nome_do_contato"] ?? "").trim(),
    contatoEmergencia: String(
      patient[columns.contatoEmergencia ?? "contato_emergencia"] ?? "",
    ).trim(),
    endereco: String(patient.endereco ?? "").trim(),
    bairro: String(patient.bairro ?? "").trim(),
    cidade: String(patient.cidade ?? "").trim(),
    cep: formatCepBr(patient.cep),
    nomePai: String(patient[columns.nomePai ?? "nome_do_pai"] ?? "").trim(),
    nomeMae: String(patient[columns.nomeMae ?? "nome_da_mae"] ?? "").trim(),
    observacoes: String(patient[columns.observacoes ?? "observacoes"] ?? "").trim(),
  };
}

export function emptySessionForm(
  seed?: Partial<SessionFormValues>,
): SessionFormValues {
  const today = new Date();
  const dateValue = toInputDateValue(today);
  const timeValue = toInputTimeValue(today);

  return {
    nome: seed?.nome ?? "",
    data: seed?.data ?? dateValue,
    hora: seed?.hora ?? timeValue,
    tipo: seed?.tipo ?? "Sessao Individual",
    valorSessao: seed?.valorSessao ?? "0",
    valorPago: seed?.valorPago ?? "0",
    anotacoesClinicas: seed?.anotacoesClinicas ?? "",
    obs: seed?.obs ?? "",
    situacao: seed?.situacao ?? "Realizado",
  };
}

export function entryToSessionForm(entry: Entry | CalendarEvent): SessionFormValues {
  return {
    nome: String(entry.nome ?? "").trim(),
    data: toInputDateValue(entry.data),
    hora: toInputTimeValue(entry.data),
    tipo: String(entry.tipo ?? "").trim() || "Sessao Individual",
    valorSessao: String(toNumber("valorSessao" in entry ? entry.valorSessao : entry.valor_sessao)),
    valorPago: String(toNumber("valorPago" in entry ? entry.valorPago : entry.valor_pago)),
    anotacoesClinicas: String(
      "anotacoesClinicas" in entry ? entry.anotacoesClinicas : entry.anotacoes_clinicas ?? "",
    ).trim(),
    obs: String(entry.obs ?? "").trim(),
    situacao: "Realizado",
  };
}

export function buildCalendarEvents(
  entries: Entry[],
  schedules: Schedule[],
): CalendarEvent[] {
  const mappedEntries = entries
    .map((entry) => {
      const startsAt = parseFlexibleDate(entry.data);
      if (!startsAt) {
        return null;
      }

      return {
        id: entry.id,
        source: "entrada" as const,
        data: String(entry.data ?? ""),
        nome: String(entry.nome ?? "").trim(),
        tipo: String(entry.tipo ?? "").trim(),
        valorSessao: toNumber(entry.valor_sessao),
        valorPago: toNumber(entry.valor_pago),
        obs: String(entry.obs ?? "").trim(),
        anotacoesClinicas: String(entry.anotacoes_clinicas ?? "").trim(),
        startsAt,
      };
    })
    .filter(Boolean) as CalendarEvent[];

  const mappedSchedules = schedules
    .map((schedule) => {
      const startsAt = parseFlexibleDate(schedule.data);
      if (!startsAt) {
        return null;
      }

      return {
        id: schedule.id,
        source: "agendamento" as const,
        data: String(schedule.data ?? ""),
        nome: String(schedule.nome ?? "").trim(),
        tipo: String(schedule.tipo ?? "").trim(),
        valorSessao: toNumber(schedule.valor_sessao),
        valorPago: toNumber(schedule.valor_pago),
        obs: String(schedule.obs ?? "").trim(),
        anotacoesClinicas: "",
        startsAt,
      };
    })
    .filter(Boolean) as CalendarEvent[];

  return [...mappedEntries, ...mappedSchedules].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  );
}

export function startOfWeek(date: Date) {
  const clone = new Date(date);
  const weekday = (clone.getDay() + 6) % 7;
  clone.setDate(clone.getDate() - weekday);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

export function addDays(date: Date, days: number) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

export function monthGridBounds(anchor: Date) {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = startOfWeek(firstDay);
  const end = addDays(startOfWeek(lastDay), 6);
  return { start, end };
}

export function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function combineLocalDateTime(date: string, time: string) {
  const safeTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${safeTime}`;
}
