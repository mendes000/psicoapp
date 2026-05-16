import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConsolidatedPatient } from "./types";
import { upcomingBirthdays } from "./utils";

function localDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12);
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function birthdayForOffset(today: Date, days: number, birthYear = 1990) {
  const birthday = addDays(today, days);
  return toDateString(localDate(birthYear, birthday.getMonth(), birthday.getDate()));
}

function makePatient(overrides: Partial<ConsolidatedPatient> = {}): ConsolidatedPatient {
  const today = new Date();

  return {
    key: "patient:1",
    patientKey: "id:1",
    hasPatientRecord: true,
    reviewState: "ok",
    duplicateNameCount: 1,
    reviewNote: "",
    nome: "Paciente Exemplo",
    nascimento: birthdayForOffset(today, 10),
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
    totalSessoes: 1,
    totalPago: 0,
    saldo: 0,
    ultimaSessaoData: toDateString(addDays(today, -10)),
    ultimasSessoes: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("upcomingBirthdays", () => {
  it("retorna aniversário de hoje com daysUntilBirthday igual a 0", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 0, 1988),
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.daysUntilBirthday).toBe(0);
  });

  it("retorna aniversário de amanhã com daysUntilBirthday igual a 1", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 1),
      }),
    ]);

    expect(result[0]?.daysUntilBirthday).toBe(1);
  });

  it("inclui aniversário dentro do prazo configurado", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 15),
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.daysUntilBirthday).toBe(15);
  });

  it("exclui aniversário fora do prazo padrão de 30 dias", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 31),
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it("calcula corretamente aniversário que cruza a virada do ano", () => {
    const currentYear = new Date().getFullYear();
    const today = localDate(currentYear, 11, 20);
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: toDateString(localDate(1990, 0, 5)),
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.daysUntilBirthday).toBe(16);
  });

  it("exclui paciente sem sessão nos últimos 6 meses", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 5),
        ultimaSessaoData: toDateString(addMonths(today, -7)),
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it("exclui paciente sem nenhuma sessão registrada", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 5),
        ultimaSessaoData: "",
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it("exclui paciente que não possui cadastro associado", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 5),
        hasPatientRecord: false,
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it("ignora nascimento ausente ou inválido sem lançar erro", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({ key: "patient:empty", nascimento: "" }),
      makePatient({ key: "patient:null", nascimento: null as unknown as string }),
      makePatient({ key: "patient:invalid", nascimento: "data-invalida" }),
    ]);

    expect(result).toHaveLength(0);
  });

  it("ordena aniversários pela proximidade", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays([
      makePatient({ key: "patient:10", nascimento: birthdayForOffset(today, 10) }),
      makePatient({ key: "patient:3", nascimento: birthdayForOffset(today, 3) }),
      makePatient({ key: "patient:20", nascimento: birthdayForOffset(today, 20) }),
    ]);

    expect(result.map((patient) => patient.daysUntilBirthday)).toEqual([3, 10, 20]);
  });

  it("calcula turnsAge com base no próximo aniversário mesmo quando ele ainda não ocorreu no ano", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);
    const birthYear = today.getFullYear() - 34;

    const result = upcomingBirthdays([
      makePatient({
        nascimento: birthdayForOffset(today, 12, birthYear),
      }),
    ]);

    expect(result[0]?.turnsAge).toBe(today.getFullYear() - birthYear);
  });

  it("respeita o parâmetro withinDays customizado", () => {
    const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const result = upcomingBirthdays(
      [
        makePatient({ key: "patient:6", nascimento: birthdayForOffset(today, 6) }),
        makePatient({ key: "patient:8", nascimento: birthdayForOffset(today, 8) }),
      ],
      7,
    );

    expect(result.map((patient) => patient.daysUntilBirthday)).toEqual([6]);
  });
});
