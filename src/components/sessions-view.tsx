"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

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
  normalizeText,
  parseFlexibleDate,
  similarity,
  toInputTimeValue,
  toNumber,
} from "../lib/utils";

interface SessionsViewProps {
  patients: Patient[];
  entries: Entry[];
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
  entries,
  seed,
  onSeedConsumed,
  onSchedule,
  onSaveSession,
}: SessionsViewProps) {
  const [form, setForm] = useState<SessionFormValues>(emptySessionForm());
  const [context, setContext] = useState<SessionEditorContext>({});
  const [busyAction, setBusyAction] = useState<"schedule" | "save" | null>(null);
  const [search, setSearch] = useState("");
  const formPanelRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);

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
    onSeedConsumed();
  }, [onSeedConsumed, seed]);

  const filteredEntries = useMemo(() => {
    if (!deferredSearch.trim()) {
      return entries;
    }

    const searchValue = deferredSearch.trim();
    const normalized = normalizeText(searchValue);
    const lowered = searchValue.toLowerCase();

    return entries.filter((entry) => {
      const name = normalizeText(entry.nome);

      return (
        name.includes(normalized) ||
        similarity(name, normalized) >= 0.72 ||
        String(entry.obs ?? "").toLowerCase().includes(lowered)
      );
    });
  }, [deferredSearch, entries]);

  const ticketMedio = useMemo(() => {
    if (entries.length === 0) {
      return 0;
    }

    return (
      entries.reduce((sum, entry) => sum + toNumber(entry.valor_pago), 0) /
      entries.length
    );
  }, [entries]);
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

  function prefillFromEntry(entry: Entry) {
    setForm(entryToSessionForm(entry));
    setContext({ entryId: entry.id });

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
            <span className="pill">{entries.length} sessoes registradas</span>
            <span className="pill">{filteredEntries.length} visiveis</span>
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

        <div className="subtle-divider" />

        <div className="patient-list">
          <button
            className={`patient-list-item ${context.entryId == null ? "active" : ""}`}
            type="button"
            onClick={() => {
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

          {filteredEntries.map((entry, index) => (
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

        {entries.length > 0 && (
          <div className="status-row section-top-space">
            <span className="pill">
              Ultima sessao: {formatDateTimeBr(entries[0]?.data)}
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
                  disabled={!canSaveSession}
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
              disabled={busyAction !== null}
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
              disabled={busyAction !== null || !canSaveSession}
              type="button"
              onClick={() => void handleSave()}
            >
              {busyAction === "save" ? "Salvando..." : "Salvar atendimento"}
            </button>
            <button
              className="btn"
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
