"use client";

import { getSupabaseBrowserClient } from "./supabase";
import type {
  DashboardSnapshot,
  Entry,
  IdValue,
  Patient,
  PatientColumnMap,
  PatientFormValues,
  Schedule,
  SessionEditorContext,
  SessionFormValues,
} from "./types";
import {
  buildDashboardSnapshot,
  combineLocalDateTime,
  parseFlexibleDate,
  stripDigits,
  toNumber,
} from "./utils";

type TableName = "pacientes" | "entradas" | "agendamentos";

const PAGE_SIZE = 1000;
const PATIENT_COLUMNS = [
  "id",
  "nome",
  "nascimento",
  "cpf",
  "tratamento",
  "profissao",
  "origem",
  "quem_indicou",
  "telefone",
  "email",
  "nome_do_contato",
  "nome_contato",
  "contato_emergencia",
  "contato_de_emergencia",
  "endereco",
  "bairro",
  "cidade",
  "cep",
  "nome_do_pai",
  "nome_pai",
  "nome_da_mae",
  "nome_mae",
  "observacoees",
  "observacoes",
].join(",");
const ENTRY_COLUMNS = [
  "id",
  "data",
  "nome",
  "tipo",
  "valor_sessao",
  "valor_pago",
  "obs",
  "anotacoes_clinicas",
].join(",");
const SCHEDULE_COLUMNS = [
  "id",
  "data",
  "nome",
  "tipo",
  "valor_sessao",
  "valor_pago",
  "obs",
].join(",");

async function fetchAllRows<T>(
  table: TableName,
  columns: string,
  orderBy: string,
  ascending = true,
) {
  return fetchAllRowsWithColumns<T>(table, columns, orderBy, ascending);
}

async function fetchAllRowsWithColumns<T>(
  table: TableName,
  columns: string,
  orderBy: string,
  ascending = true,
) {
  const supabase = getSupabaseBrowserClient();
  const records: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const batch = (data ?? []) as T[];
    records.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return records;
}

async function fetchAllRowsWithFallback<T>(
  table: TableName,
  columns: string,
  orderBy: string,
  ascending = true,
) {
  try {
    return await fetchAllRowsWithColumns<T>(table, columns, orderBy, ascending);
  } catch (error) {
    if (columns === "*") {
      throw error;
    }

    return fetchAllRowsWithColumns<T>(table, "*", orderBy, ascending);
  }
}

export async function loadPatients() {
  return fetchAllRowsWithFallback<Patient>("pacientes", PATIENT_COLUMNS, "nome", true);
}

export async function loadEntries() {
  return fetchAllRowsWithFallback<Entry>("entradas", ENTRY_COLUMNS, "data", false);
}

export async function loadSchedules() {
  return fetchAllRowsWithFallback<Schedule>("agendamentos", SCHEDULE_COLUMNS, "data", true);
}

function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<DashboardSnapshot>;
  return (
    !!snapshot.metrics &&
    typeof snapshot.reviewCount === "number" &&
    typeof snapshot.totalCount === "number" &&
    typeof snapshot.limited === "boolean" &&
    Array.isArray(snapshot.items)
  );
}

export async function loadDashboardSnapshot(options?: {
  search?: string;
  reviewOnly?: boolean;
  itemLimit?: number;
}) {
  const search = String(options?.search ?? "").trim();
  const reviewOnly = options?.reviewOnly ?? false;
  const itemLimit = options?.itemLimit ?? 20;
  const supabase = getSupabaseBrowserClient();

  try {
    const { data, error } = await supabase.rpc("buscar_painel_clinico", {
      search_text: search || null,
      review_only: reviewOnly,
      item_limit: itemLimit,
    });

    if (error) {
      throw error;
    }

    if (!isDashboardSnapshot(data)) {
      throw new Error("Resposta invalida do resumo do painel.");
    }

    return data;
  } catch {
    try {
      const [patients, entries] = await Promise.all([loadPatients(), loadEntries()]);
      return buildDashboardSnapshot(patients, entries, {
        search,
        reviewOnly,
        itemLimit,
      });
    } catch (fallbackError) {
      if (fallbackError instanceof Error) {
        throw fallbackError;
      }

      const message =
        typeof fallbackError === "object" &&
        fallbackError !== null &&
        "message" in fallbackError &&
        typeof fallbackError.message === "string"
          ? fallbackError.message
          : "Falha ao carregar o painel.";

      throw new Error(message);
    }
  }
}

function insertPayload(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value == null) {
        return false;
      }

      if (typeof value === "string") {
        return value.trim() !== "";
      }

      return true;
    }),
  );
}

function updatePayload(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (typeof value === "string") {
        const text = value.trim();
        return [key, text || null];
      }

      return [key, value];
    }),
  );
}

function patientFormToPayload(
  form: PatientFormValues,
  columns: PatientColumnMap,
) {
  const payload: Record<string, unknown> = {
    nome: form.nome.trim(),
    tratamento: form.tratamento.trim(),
    cpf: stripDigits(form.cpf),
    email: form.email.trim(),
    telefone: form.telefone.trim(),
    profissao: form.profissao.trim(),
    origem: form.origem.trim(),
    endereco: form.endereco.trim(),
    bairro: form.bairro.trim(),
    cidade: form.cidade.trim(),
    cep: stripDigits(form.cep),
    quem_indicou: form.quemIndicou.trim(),
  };

  if (columns.nascimento) {
    const parsedBirth = parseFlexibleDate(form.nascimento);
    payload[columns.nascimento] = parsedBirth
      ? `${parsedBirth.getFullYear()}-${`${parsedBirth.getMonth() + 1}`.padStart(2, "0")}-${`${parsedBirth.getDate()}`.padStart(2, "0")}`
      : form.nascimento.trim();
  }

  if (columns.nomeContato) {
    payload[columns.nomeContato] = form.nomeContato.trim();
  }

  if (columns.contatoEmergencia) {
    payload[columns.contatoEmergencia] = form.contatoEmergencia.trim();
  }

  if (columns.nomePai) {
    payload[columns.nomePai] = form.nomePai.trim();
  }

  if (columns.nomeMae) {
    payload[columns.nomeMae] = form.nomeMae.trim();
  }

  if (columns.observacoes) {
    payload[columns.observacoes] = form.observacoes.trim();
  }

  return payload;
}

export async function upsertPatientRecord(args: {
  form: PatientFormValues;
  existing: Patient | null;
  columns: PatientColumnMap;
}) {
  const supabase = getSupabaseBrowserClient();
  const payload = patientFormToPayload(args.form, args.columns);

  if (args.existing) {
    let query = supabase
      .from("pacientes")
      .update(updatePayload(payload));

    if (args.existing.id != null) {
      query = query.eq("id", args.existing.id as never);
    } else if (args.existing.cpf) {
      query = query.eq("cpf", args.existing.cpf);
    } else {
      const name = String(args.existing.nome ?? "").trim();
      const email = String(args.existing.email ?? "").trim();
      const phone = String(args.existing.telefone ?? "").trim();

      query = query.eq("nome", name);
      if (email) {
        query = query.eq("email", email);
      } else if (phone) {
        query = query.eq("telefone", phone);
      }
    }

    const { error } = await query;
    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("pacientes")
    .insert(insertPayload(payload));

  if (error) {
    throw error;
  }
}

function resolveNumericValue(raw: string) {
  const sanitized = raw.replace(",", ".");
  return toNumber(sanitized);
}

export function hasIdentifier(value: IdValue) {
  return value !== null && value !== undefined && value !== "";
}

function scheduleFormToPayload(form: SessionFormValues) {
  return {
    data: combineLocalDateTime(form.data, form.hora),
    nome: form.nome.trim(),
    tipo: form.tipo.trim(),
    valor_sessao: resolveNumericValue(form.valorSessao),
    valor_pago: resolveNumericValue(form.valorPago),
    obs: form.obs.trim(),
  };
}

export async function createScheduleRecord(
  form: SessionFormValues,
  context: SessionEditorContext = {},
) {
  const supabase = getSupabaseBrowserClient();
  const payload = scheduleFormToPayload(form);

  if (hasIdentifier(context.scheduleId)) {
    const { error } = await supabase
      .from("agendamentos")
      .update(payload)
      .eq("id", context.scheduleId as never);

    if (error) {
      throw error;
    }

    return { updated: true };
  }

  const { error } = await supabase.from("agendamentos").insert(payload);
  if (error) {
    throw error;
  }

  return { updated: false };
}

export async function saveSessionRecord(
  form: SessionFormValues,
  context: SessionEditorContext,
) {
  if (form.situacao === "Remarcado") {
    return { remarcar: true };
  }

  const supabase = getSupabaseBrowserClient();
  const dataHora = combineLocalDateTime(form.data, form.hora);
  const date = parseFlexibleDate(dataHora);
  const label = date
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date)
    : dataHora;

  let valorSessao = resolveNumericValue(form.valorSessao);
  let valorPago = resolveNumericValue(form.valorPago);
  let log = "";

  if (form.situacao === "Realizado") {
    log = `Sessao realizada em ${label}.`;
  }

  if (form.situacao === "Falta abonada") {
    log = `Sessao abonada em ${label}.`;
    valorSessao = 0;
    valorPago = 0;
  }

  if (form.situacao === "Falta cobrada") {
    log = `Cliente faltou em ${label}.`;
  }

  const payload = {
    data: dataHora,
    nome: form.nome.trim(),
    tipo: form.tipo.trim(),
    valor_sessao: valorSessao,
    valor_pago: valorPago,
    anotacoes_clinicas: form.anotacoesClinicas.trim(),
    obs: [log, form.obs.trim()].filter(Boolean).join("\n"),
  };

  if (context.entryId != null) {
    const { error } = await supabase
      .from("entradas")
      .update(payload)
      .eq("id", context.entryId as never);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase.from("entradas").insert(payload);
    if (error) {
      throw error;
    }
  }

  if (context.scheduleId != null) {
    const { error } = await supabase
      .from("agendamentos")
      .delete()
      .eq("id", context.scheduleId as never);

    if (error) {
      throw error;
    }
  }

  return { remarcar: false };
}

export async function updateEntryFinancialRecord(args: {
  entryId: IdValue;
  valorPago: number;
  obs: string;
}) {
  if (!hasIdentifier(args.entryId)) {
    throw new Error("Sessao sem identificador para atualizacao.");
  }

  const supabase = getSupabaseBrowserClient();
  const payload = updatePayload({
    valor_pago: args.valorPago,
    obs: args.obs,
  });

  const { error } = await supabase
    .from("entradas")
    .update(payload)
    .eq("id", args.entryId as never);

  if (error) {
    throw error;
  }
}

export async function updatePatientObservationRecord(args: {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  observacoes: string;
  column?: string;
}) {
  const lookupName = String(args.nome ?? "").trim();
  const lookupCpf = stripDigits(args.cpf);
  const lookupEmail = String(args.email ?? "").trim();
  const lookupPhone = String(args.telefone ?? "").trim();

  if (!lookupName && !lookupCpf && !lookupEmail && !lookupPhone) {
    throw new Error("Paciente sem identificador para atualizar observacoes.");
  }

  const supabase = getSupabaseBrowserClient();
  const candidateColumns = Array.from(
    new Set(
      [args.column, "observacoes", "observacoees"].filter(
        (value): value is string => Boolean(value?.trim()),
      ),
    ),
  );
  let lastError: unknown = null;

  for (const column of candidateColumns) {
    let query = supabase
      .from("pacientes")
      .update(
        updatePayload({
          [column]: args.observacoes,
        }),
      );

    if (lookupCpf) {
      query = query.eq("cpf", lookupCpf);
    } else if (lookupEmail) {
      query = query.eq("email", lookupEmail);
    } else if (lookupPhone) {
      query = query.eq("telefone", lookupPhone);
    } else {
      query = query.eq("nome", lookupName);
    }

    const { data, error } = await query.select("id").limit(1);

    if (!error && (data?.length ?? 0) > 0) {
      return;
    }

    lastError =
      error ?? new Error("Paciente nao encontrado para atualizar observacoes.");
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Falha ao atualizar observacoes do paciente.");
}

export async function signOutSupabase() {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
