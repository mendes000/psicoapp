"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { loadEntryDetail } from "../lib/data";
import type {
  Entry,
  Patient,
  SessionEditorContext,
  SessionFormValues,
  SessionSeed,
} from "../lib/types";
import {
  emptySessionForm,
  entryToSessionForm,
  formatCurrency,
  formatDateTimeBr,
  parseFlexibleDate,
  toInputDateValue,
  toInputTimeValue,
  toNumber,
} from "../lib/utils";

interface SessionsViewProps {
  patients: Patient[];
  fallbackEntries?: Entry[];
  onLoadSessions: (options: {
    search?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
    entries?: Entry[];
  }) => Promise<{ items: Entry[]; total: number }>;
  seed: SessionSeed | null;
  onSeedConsumed: () => void;
  onSchedule: (
    form: SessionFormValues,
    context: SessionEditorContext,
  ) => Promise<void>;
  onSaveSession: (
    form: SessionFormValues,
    context: SessionEditorContext,
  ) => Promise<{ remarcar: boolean }>;
}

export function SessionsView({
  patients,
  fallbackEntries,
  onLoadSessions,
  seed,
  onSeedConsumed,
  onSchedule,
  onSaveSession,
}: SessionsViewProps) {
  const [form, setForm] = useState<SessionFormValues>(emptySessionForm());
  const [context, setContext] = useState<SessionEditorContext>({});
  const [busyAction, setBusyAction] = useState<"schedule" | "save" | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return toInputDateValue(date);
  });
  const [toDate, setToDate] = useState(() => toInputDateValue(new Date()));
  const [page, setPage] = useState(0);
  const [pageEntries, setPageEntries] = useState<Entry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const formPanelRef = useRef<HTMLDivElement | null>(null);
  const detailRequestIdRef = useRef(0);
  const listRequestIdRef = useRef(0);
  const pageSize = 30;

  const patientNames = useMemo(
    () =>
      Array.from(
        new Set(
          patients
            .map((patient) => String(patient.nome ?? "").trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-BR")),
    [patients],
  );

  useEffect(() => {
    if (!seed) {
      return;
    }

    setForm((current) => ({
      ...current,
      ...emptySessionForm(seed.form),
      ...seed.form,
    }));
    setContext(seed.context ?? {});
    if (seed.context?.entryId !== null && seed.context?.entryId !== undefined && seed.context.entryId !== "") {
      void hydrateEntryDetail(String(seed.context.entryId));
    }
    onSeedConsumed();
  }, [onSeedConsumed, seed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setListLoading(true);

    void onLoadSessions({
      search: debouncedSearch,
      fromDate: parseDateInput(fromDate),
      toDate: endOfInputDay(toDate),
      limit: pageSize,
      offset: page * pageSize,
      entries: fallbackEntries,
    })
      .then(({ items, total }) => {
        if (listRequestIdRef.current === requestId) {
          setPageEntries(items);
          setTotalEntries(total);
        }
      })
      .finally(() => {
        if (listRequestIdRef.current === requestId) {
          setListLoading(false);
        }
      });
  }, [debouncedSearch, fallbackEntries, fromDate, onLoadSessions, page, refreshVersion, toDate]);

  const ticketMedio = useMemo(() => {
    if (pageEntries.length === 0) {
      return 0;
    }

    return (
      pageEntries.reduce((sum, entry) => sum + toNumber(entry.valor_pago), 0) /
      pageEntries.length
    );
  }, [pageEntries]);
  const isPaid = useMemo(() => toNumber(form.valorPago) > 0, [form.valorPago]);
  const canSaveSession = useMemo(() => {
    const date = parseFlexibleDate(`${form.data}T${form.hora}`);
    if (!date) {
      return false;
    }

    return Date.now() > date.getTime();
  }, [form.data, form.hora]);

  function resolvePaidValue(nextValorSessao: string, paid: boolean) {
    if (!paid) {
      return "0";
    }

    return nextValorSessao.trim() || "0";
  }

  async function hydrateEntryDetail(entryId: string) {
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setDetailLoading(true);

    try {
      const detail = await loadEntryDetail(entryId);
      if (detailRequestIdRef.current === requestId) {
        setForm(entryToSessionForm(detail));
      }
    } catch {
      // Keep the lightweight entry data already present in the form.
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }

  function prefillFromEntry(entry: Entry) {
    setForm(entryToSessionForm(entry));
    setContext({ entryId: entry.id });
    if (entry.id !== null && entry.id !== undefined && entry.id !== "") {
      void hydrateEntryDetail(String(entry.id));
    }

    window.requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function handleSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.nome.trim()) {
      return;
    }

    setBusyAction("schedule");
    try {
      await onSchedule(form, context);
      setContext({});
      setForm((current) =>
        emptySessionForm({
          nome: current.nome,
          data: current.data,
          hora: current.hora,
        }),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      return;
    }

    setBusyAction("save");
    try {
      const result = await onSaveSession(form, context);

      if (result.remarcar) {
        const now = new Date();
        setContext({});
        setForm((current) =>
          emptySessionForm({
            nome: current.nome,
            data: current.data,
            hora: toInputTimeValue(now),
          }),
        );
        return;
      }

      setContext({});
      setForm((current) =>
        emptySessionForm({
          nome: current.nome,
        }),
      );
      setRefreshVersion((current) => current + 1);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="two-col reveal">
      <aside className="panel">
        <div className="panel-title">
          <div>
            <h2 className="panel-heading">Historico</h2>
            <p className="panel-subcopy">
              Selecione uma sessao existente para editar ou abra um formulario em branco.
            </p>
          </div>
          <div className="panel-meta">
            <span className="pill">{totalEntries} sessoes registradas</span>
            <span className="pill">{pageEntries.length} nesta pagina</span>
            <span className="pill">Ticket medio {formatCurrency(ticketMedio)}</span>
          </div>
        </div>

        <label className="field">
          <span>Filtrar sessoes</span>
          <div className="input-shell">
            <input
              placeholder="Buscar por paciente ou observacao"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </label>

        <div className="input-grid">
          <label className="field">
            <span>De</span>
            <div className="input-shell">
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPage(0);
                }}
              />
            </div>
          </label>
          <label className="field">
            <span>Ate</span>
            <div className="input-shell">
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPage(0);
                }}
              />
            </div>
          </label>
        </div>

        <div className="subtle-divider" />

        <div className="patient-list">
          <button
            className={`patient-list-item ${context.entryId == null ? "active" : ""}`}
            type="button"
            onClick={() => {
              detailRequestIdRef.current += 1;
              setDetailLoading(false);
              setContext({});
              setForm(emptySessionForm());
              window.requestAnimationFrame(() => {
                formPanelRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              });
            }}
          >
            <strong>+ Nova sessao</strong>
            <span>Abre o formulario em branco para um novo atendimento.</span>
          </button>

          {listLoading && <div className="empty-state">Carregando sessoes...</div>}

          {!listLoading && pageEntries.map((entry, index) => (
            <button
              className={`patient-list-item ${context.entryId === entry.id ? "active" : ""}`}
              key={[
                entry.id ?? "sem-id",
                entry.data ?? "sem-data",
                entry.nome ?? "sem-nome",
                index,
              ].join("-")}
              type="button"
              onClick={() => prefillFromEntry(entry)}
            >
              <strong>{entry.nome || "Sem nome"}</strong>
              <span>{formatDateTimeBr(entry.data)}</span>
              <span>
                {entry.tipo || "Sem tipo"} | Pago {formatCurrency(entry.valor_pago)}
              </span>
            </button>
          ))}
        </div>

        <div className="actions-row section-top-space">
          <button
            className="btn"
            disabled={page === 0 || listLoading}
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Anterior
          </button>
          <span className="pill">
            Pagina {page + 1} de {Math.max(1, Math.ceil(totalEntries / pageSize))}
          </span>
          <button
            className="btn"
            disabled={(page + 1) * pageSize >= totalEntries || listLoading}
            type="button"
            onClick={() => setPage((current) => current + 1)}
          >
            Proximo
          </button>
        </div>

        {pageEntries.length > 0 && (
          <div className="status-row section-top-space">
            <span className="pill">
              Ultima sessao: {formatDateTimeBr(pageEntries[0]?.data)}
            </span>
          </div>
        )}
      </aside>

      <div className="panel" ref={formPanelRef}>
        <div className="panel-title">
          <div>
            <h2 className="panel-heading">
              {context.entryId != null ? "Editar sessao" : "Nova sessao"}
            </h2>
            <p className="panel-subcopy">
              Agende atendimentos futuros ou registre sessoes realizadas, faltas e edicoes.
            </p>
          </div>
          <div className="panel-meta">
            {context.entryId != null && (
              <span className="pill">Editando sessao existente</span>
            )}
            {context.scheduleId != null && (
              <span className="pill">Editando agendamento existente</span>
            )}
            {!canSaveSession && (
              <span className="pill">Salvar atendimento libera apos o horario</span>
            )}
          </div>
        </div>

        <form className="layout-grid" onSubmit={handleSchedule}>
          <div className="input-grid">
            <label className="field">
              <span>Paciente</span>
              <div className="input-shell">
                <input
                  disabled={detailLoading}
                  list="patient-name-options"
                  placeholder="Selecione ou digite o nome"
                  value={form.nome}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nome: event.target.value }))
                  }
                />
                <datalist id="patient-name-options">
                  {patientNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </label>

            <label className="field">
              <span>Data</span>
              <div className="input-shell">
                <input
                  disabled={detailLoading}
                  type="date"
                  value={form.data}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, data: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Horario</span>
              <div className="input-shell">
                <input
                  disabled={detailLoading}
                  type="time"
                  value={form.hora}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, hora: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Tipo</span>
              <div className="select-shell">
                <select
                  disabled={detailLoading}
                  value={form.tipo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tipo: event.target.value }))
                  }
                >
                  <option value="Sessao Individual">Sessao Individual</option>
                  <option value="Avaliacao">Avaliacao</option>
                  <option value="Falta - sem aviso">Falta - sem aviso</option>
                  <option value="Falta - avisou mesmo dia">Falta - avisou mesmo dia</option>
                  <option value="Remarcacao">Remarcacao</option>
                </select>
              </div>
            </label>

            <label className="field">
              <span>Valor da sessao</span>
              <div className="input-shell">
                <input
                  disabled={detailLoading}
                  inputMode="decimal"
                  value={form.valorSessao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      valorSessao: event.target.value,
                      valorPago: resolvePaidValue(
                        event.target.value,
                        toNumber(current.valorPago) > 0,
                      ),
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Valor pago</span>
              <div className="payment-toggle finance-toggle session-payment-toggle">
                <span className={`payment-toggle-label ${!isPaid ? "active" : ""}`}>
                  Nao
                </span>
                <button
                  aria-checked={isPaid}
                  aria-label={isPaid ? "Sessao marcada como paga" : "Sessao marcada como nao paga"}
                  className={`payment-switch ${isPaid ? "active" : ""}`}
                  disabled={detailLoading}
                  role="switch"
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      valorPago: isPaid
                        ? "0"
                        : resolvePaidValue(current.valorSessao, true),
                    }))
                  }
                />
                <span className={`payment-toggle-label ${isPaid ? "active" : ""}`}>
                  Pago
                </span>
              </div>
            </label>
          </div>

          <div className="input-grid">
            <label className="field">
              <span>Evolucao clinica</span>
              <div className="textarea-shell">
                <textarea
                  disabled={detailLoading}
                  value={form.anotacoesClinicas}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      anotacoesClinicas: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Observacoes</span>
              <div className="textarea-shell">
                <textarea
                  disabled={detailLoading}
                  value={form.obs}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, obs: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Situacao</span>
              <div className="select-shell">
                <select
                  disabled={detailLoading || !canSaveSession}
                  value={form.situacao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      situacao: event.target.value as SessionFormValues["situacao"],
                    }))
                  }
                >
                  <option value="Realizado">Realizado</option>
                  <option value="Remarcado">Remarcado</option>
                  <option value="Falta abonada">Falta abonada</option>
                  <option value="Falta cobrada">Falta cobrada</option>
                </select>
              </div>
            </label>
          </div>

          <div className="actions-row">
            <button
              className="btn btn-secondary"
              disabled={detailLoading || busyAction !== null}
              type="submit"
            >
              {busyAction === "schedule"
                ? context.scheduleId != null
                  ? "Atualizando..."
                  : "Agendando..."
                : context.scheduleId != null
                  ? "Atualizar agendamento"
                  : "Agendar"}
            </button>
            <button
              className="btn btn-primary"
              disabled={detailLoading || busyAction !== null || !canSaveSession}
              type="button"
              onClick={() => void handleSave()}
            >
              {busyAction === "save" ? "Salvando..." : "Salvar atendimento"}
            </button>
            <button
              className="btn"
              disabled={detailLoading}
              type="button"
              onClick={() => {
                setContext({});
                setForm(emptySessionForm());
              }}
            >
              Limpar
            </button>
          </div>

          {!canSaveSession && (
            <p className="helper-text">
              Para registrar o atendimento, a data e o horario precisam estar no passado.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function parseDateInput(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfInputDay(value: string) {
  const date = parseDateInput(value);
  if (!date) {
    return undefined;
  }

  date.setHours(23, 59, 59, 999);
  return date;
}
