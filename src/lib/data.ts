"use client";

import { getSupabaseBrowserClient } from "./supabase";
import type {
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
  combineLocalDateTime,
  parseFlexibleDate,
  stripDigits,
  toNumber,
} from "./utils";

type TableName = "pacientes" | "entradas" | "agendamentos";

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  table: TableName,
  orderBy: string,
  ascending = true,
) {
  const supabase = getSupabaseBrowserClient();
  const records: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
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

export async function loadPatients() {
  return fetchAllRows<Patient>("pacientes", "nome", true);
}

export async function loadEntries() {
  return fetchAllRows<Entry>("entradas", "data", false);
}

export async function loadSchedules() {
  return fetchAllRows<Schedule>("agendamentos", "data", true);
}

export async function loadClinicData() {
  const [patients, entries, schedules] = await Promise.all([
    loadPatients(),
    loadEntries(),
    loadSchedules(),
  ]);

  return { patients, entries, schedules };
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

export async function signOutSupabase() {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
